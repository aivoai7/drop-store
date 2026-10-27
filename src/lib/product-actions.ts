"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "./db";
import { getAdminUser } from "./auth";
import { recordAudit } from "./audit";
import { clientIp } from "./request";
import { canEdit } from "./permissions";
import { syncVariants, defaultSku } from "./variants";
import { ADMIN_BASE, adminPath } from "@/lib/admin-path";

async function requireEditor() {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  if (!canEdit(admin.role)) redirect("/admin?denied=1");
  return admin;
}

const productSchema = z.object({
  name: z.string().trim().min(2, "Name is too short"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers and dashes"),
  tagline: z.string().trim().max(120),
  description: z.string().trim(),
  price: z.number().int().positive("Price must be greater than zero"),
  compareAt: z.number().int().positive().nullable(),
  categoryId: z.string().min(1, "Pick a category"),
  badge: z.string().trim().max(20).nullable(),
  status: z.enum(["draft", "active", "archived"]),
  featured: z.boolean(),
});

function parseMoney(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (!value) return null;
  const parsed = Math.round(Number(value) * 100);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseList(raw: FormDataEntryValue | null) {
  return String(raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseImages(raw: FormDataEntryValue | null) {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function readForm(formData: FormData) {
  return {
    fields: {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      tagline: String(formData.get("tagline") ?? ""),
      description: String(formData.get("description") ?? ""),
      price: parseMoney(formData.get("price")) ?? 0,
      compareAt: parseMoney(formData.get("compareAt")),
      categoryId: String(formData.get("categoryId") ?? ""),
      badge: String(formData.get("badge") ?? "").trim() || null,
      status: String(formData.get("status") ?? "draft") as "draft" | "active" | "archived",
      featured: formData.get("featured") === "on",
    },
    colors: parseList(formData.get("colors")),
    sizes: parseList(formData.get("sizes")),
    images: parseImages(formData.get("images")),
    stock: formData,
  };
}

export async function createProduct(formData: FormData) {
  const admin = await requireEditor();
  const { fields, colors, sizes, images, stock } = readForm(formData);

  const parsed = productSchema.safeParse(fields);
  if (!parsed.success) redirect(`${ADMIN_BASE}/products/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  if (colors.length === 0 || sizes.length === 0) redirect("/admin/products/new?error=Add at least one color and size");
  if (images.length === 0) redirect("/admin/products/new?error=Add at least one image URL");

  const clash = await prisma.product.findUnique({ where: { slug: parsed.data.slug } });
  if (clash) redirect("/admin/products/new?error=That slug is already in use");

  const product = await prisma.product.create({
    data: {
      id: parsed.data.slug,
      ...parsed.data,
      colors: JSON.stringify(colors),
      sizes: JSON.stringify(sizes),
      images: JSON.stringify(images),
      stock: 0,
      variants: {
        create: colors.flatMap((color) =>
          sizes.map((size) => ({
            color,
            size,
            sku: defaultSku(parsed.data.slug, color, size),
            stock: Number(stock.get(`stock.${color}|${size}`) ?? 0) || 0,
          })),
        ),
      },
    },
  });

  await prisma.product.update({
    where: { id: product.id },
    data: {
      stock: colors.length * sizes.length ? 0 : 0,
    },
  });

  const { refreshProductStock } = await import("./variants");
  await refreshProductStock(product.id);

  await recordAudit({
    actor: admin,
    action: "product.created",
    target: product.slug,
    metadata: { name: product.name },
    ip: await clientIp(),
  });
  revalidatePath(adminPath("/products"));
  redirect(`${ADMIN_BASE}/products/${product.id}`);
}

export async function updateProduct(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const { fields, colors, sizes, images, stock } = readForm(formData);

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) redirect(adminPath("/products"));

  const parsed = productSchema.safeParse(fields);
  const backTo = `${ADMIN_BASE}/products/${id}`;
  if (!parsed.success) redirect(`${backTo}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  if (colors.length === 0 || sizes.length === 0) redirect(`${backTo}?error=Add at least one color and size`);
  if (images.length === 0) redirect(`${backTo}?error=Add at least one image URL`);

  if (parsed.data.slug !== existing.slug) {
    const clash = await prisma.product.findUnique({ where: { slug: parsed.data.slug } });
    if (clash) redirect(`${backTo}?error=That slug is already in use`);
  }

  await prisma.product.update({
    where: { id },
    data: {
      ...parsed.data,
      colors: JSON.stringify(colors),
      sizes: JSON.stringify(sizes),
      images: JSON.stringify(images),
    },
  });

  const inputs = colors.flatMap((color) =>
    sizes.map((size) => ({
      color,
      size,
      stock: Number(stock.get(`stock.${color}|${size}`) ?? 0) || 0,
      price: parseMoney(stock.get(`price.${color}|${size}`)),
    })),
  );
  await syncVariants(id, inputs);

  await recordAudit({
    actor: admin,
    action: "product.updated",
    target: parsed.data.slug,
    metadata: { price: { from: existing.price, to: parsed.data.price } },
    ip: await clientIp(),
  });
  revalidatePath(adminPath("/products"));
  redirect(`${backTo}?saved=1`);
}

export async function deleteProduct(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) redirect(adminPath("/products"));

  const ordered = await prisma.orderItem.count({ where: { productId: id } });
  if (ordered > 0) {
    // Never destroy the audit trail of a product someone bought.
    await prisma.product.update({ where: { id }, data: { status: "archived" } });
    await recordAudit({
      actor: admin,
      action: "product.archived",
      target: product.slug,
      metadata: { reason: "has order history" },
      ip: await clientIp(),
    });
    redirect(adminPath("/products?archived=1"));
  }

  await prisma.product.delete({ where: { id } });
  await recordAudit({
    actor: admin,
    action: "product.deleted",
    target: product.slug,
    ip: await clientIp(),
  });
  revalidatePath(adminPath("/products"));
  redirect(adminPath("/products?deleted=1"));
}

export async function bulkProductAction(formData: FormData) {
  const admin = await requireEditor();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const action = String(formData.get("bulkAction"));
  if (ids.length === 0) redirect(adminPath("/products"));

  if (action === "activate" || action === "archive") {
    await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { status: action === "activate" ? "active" : "archived" },
    });
  } else if (action === "feature" || action === "unfeature") {
    await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { featured: action === "feature" },
    });
  } else if (action === "price") {
    const percent = Number(formData.get("percent"));
    if (!Number.isFinite(percent) || percent === 0 || Math.abs(percent) > 90) {
      redirect("/admin/products?error=Enter a percentage between -90 and 90");
    }
    const products = await prisma.product.findMany({ where: { id: { in: ids } } });
    for (const product of products) {
      const next = Math.max(100, Math.round(product.price * (1 + percent / 100)));
      await prisma.product.update({ where: { id: product.id }, data: { price: next } });
    }
  } else if (action === "delete") {
    for (const id of ids) {
      const ordered = await prisma.orderItem.count({ where: { productId: id } });
      if (ordered > 0) {
        await prisma.product.update({ where: { id }, data: { status: "archived" } });
      } else {
        await prisma.product.delete({ where: { id } });
      }
    }
  }

  await recordAudit({
    actor: admin,
    action: "product.bulk",
    target: `${ids.length} products`,
    metadata: { action, ids },
    ip: await clientIp(),
  });
  revalidatePath(adminPath("/products"));
  redirect(adminPath("/products?bulk=1"));
}

export async function toggleProductFeatured(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) redirect(adminPath("/products"));

  await prisma.product.update({ where: { id }, data: { featured: !before.featured } });
  await recordAudit({
    actor: admin,
    action: "product.featured.toggled",
    target: before.slug,
    metadata: { from: before.featured, to: !before.featured },
    ip: await clientIp(),
  });
  redirect(adminPath("/products"));
}

export async function updateVariantStock(formData: FormData) {
  const admin = await requireEditor();
  const variantId = String(formData.get("variantId"));
  const stock = Number(formData.get("stock"));
  const productId = String(formData.get("productId"));
  if (!Number.isInteger(stock) || stock < 0) redirect(`${ADMIN_BASE}/products/${productId}`);

  const before = await prisma.variant.findUnique({ where: { id: variantId } });
  if (!before) redirect(`${ADMIN_BASE}/products/${productId}`);

  await prisma.variant.update({ where: { id: variantId }, data: { stock } });
  const { refreshProductStock } = await import("./variants");
  await refreshProductStock(productId);

  await recordAudit({
    actor: admin,
    action: "variant.stock.changed",
    target: before.sku,
    metadata: { from: before.stock, to: stock },
    ip: await clientIp(),
  });
  redirect(`${ADMIN_BASE}/products/${productId}?saved=1`);
}
