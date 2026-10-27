"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getAdminUser } from "./auth";
import { recordAudit } from "./audit";
import { clientIp } from "./request";
import { canEdit } from "./permissions";

async function requireEditor() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if (!canEdit(admin.role)) redirect("/admin/categories?denied=1");
  return admin;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function createCategory(formData: FormData) {
  const admin = await requireEditor();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) redirect("/admin/categories?error=Enter a category name");

  const slug = slugify(String(formData.get("slug") ?? "") || name);
  const clash = await prisma.category.findUnique({ where: { slug } });
  if (clash) redirect("/admin/categories?error=That slug is already used");

  const count = await prisma.category.count();
  const category = await prisma.category.create({
    data: { id: slug, name, slug, position: count },
  });

  await recordAudit({
    actor: admin,
    action: "category.created",
    target: category.slug,
    ip: await clientIp(),
  });
  revalidatePath("/admin/categories");
  revalidatePath("/admin/categories");
  redirect("/admin/categories?saved=1");
}

export async function updateCategory(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const hidden = formData.get("hidden") === "on";
  if (name.length < 2) redirect("/admin/categories?error=Enter a category name");

  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) redirect("/admin/categories");

  await prisma.category.update({ where: { id }, data: { name, description, hidden } });
  await recordAudit({
    actor: admin,
    action: "category.updated",
    target: before.slug,
    metadata: { from: before.name, to: name, hidden },
    ip: await clientIp(),
  });
  revalidatePath("/admin/categories");
  revalidatePath("/admin/categories");
  redirect("/admin/categories?saved=1");
}

export async function deleteCategory(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) redirect("/admin/categories");

  if (category._count.products > 0) {
    redirect("/admin/categories?error=Move or delete the products in this category first");
  }

  await prisma.category.delete({ where: { id } });
  await recordAudit({
    actor: admin,
    action: "category.deleted",
    target: category.slug,
    ip: await clientIp(),
  });
  revalidatePath("/admin/categories");
  revalidatePath("/admin/categories");
  redirect("/admin/categories?saved=1");
}
