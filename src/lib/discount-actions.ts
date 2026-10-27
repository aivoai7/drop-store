"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "./db";
import { getAdminUser } from "./auth";
import { recordAudit } from "./audit";
import { clientIp } from "./request";
import { canEdit } from "./permissions";

async function requireEditor() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if (!canEdit(admin.role)) redirect("/admin/discounts?denied=1");
  return admin;
}

const schema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, "Code must be at least 3 characters")
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, "Use letters, numbers, dashes or underscores"),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().int().positive("Value must be positive"),
  minSubtotal: z.number().int().min(0),
  usageLimit: z.number().int().positive().nullable(),
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  active: z.boolean(),
});

function parseDate(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseValue(formData: FormData): number {
  const type = String(formData.get("type"));
  const raw = String(formData.get("value") ?? "").replace(/[^0-9.]/g, "");
  const number = Number(raw);
  if (!Number.isFinite(number)) return 0;
  // Percentages are whole numbers; fixed amounts are entered in dollars.
  return type === "fixed" ? Math.round(number * 100) : Math.round(number);
}

export async function createDiscount(formData: FormData) {
  const admin = await requireEditor();
  const parsed = schema.safeParse({
    code: String(formData.get("code") ?? ""),
    type: String(formData.get("type") ?? "percentage"),
    value: parseValue(formData),
    minSubtotal: Math.round(Number(String(formData.get("minSubtotal") ?? "0")) * 100) || 0,
    usageLimit: formData.get("usageLimit") ? Number(formData.get("usageLimit")) : null,
    startsAt: parseDate(formData.get("startsAt")),
    endsAt: parseDate(formData.get("endsAt")),
    active: formData.get("active") === "on",
  });

  if (!parsed.success) {
    revalidatePath("/admin/discounts");
  redirect(`/admin/discounts?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  if (parsed.data.type === "percentage" && parsed.data.value > 100) {
    redirect("/admin/discounts?error=A percentage discount can't exceed 100");
  }
  if (parsed.data.startsAt && parsed.data.endsAt && parsed.data.startsAt >= parsed.data.endsAt) {
    redirect("/admin/discounts?error=End date must be after the start date");
  }

  const clash = await prisma.discount.findUnique({ where: { code: parsed.data.code } });
  if (clash) redirect("/admin/discounts?error=That code already exists");

  const discount = await prisma.discount.create({ data: parsed.data });
  await recordAudit({
    actor: admin,
    action: "discount.created",
    target: discount.code,
    metadata: { type: discount.type, value: discount.value },
    ip: await clientIp(),
  });
  revalidatePath("/admin/discounts");
  redirect("/admin/discounts?saved=1");
}

export async function toggleDiscount(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const discount = await prisma.discount.findUnique({ where: { id } });
  if (!discount) redirect("/admin/discounts");

  await prisma.discount.update({ where: { id }, data: { active: !discount.active } });
  await recordAudit({
    actor: admin,
    action: discount.active ? "discount.deactivated" : "discount.activated",
    target: discount.code,
    ip: await clientIp(),
  });
  revalidatePath("/admin/discounts");
  redirect("/admin/discounts?saved=1");
}

export async function deleteDiscount(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const discount = await prisma.discount.findUnique({ where: { id } });
  if (!discount) redirect("/admin/discounts");

  if (discount.usedCount > 0) {
    // Keep the redemption history intact.
    await prisma.discount.update({ where: { id }, data: { active: false } });
    await recordAudit({
      actor: admin,
      action: "discount.deactivated",
      target: discount.code,
      metadata: { reason: "has redemptions" },
      ip: await clientIp(),
    });
    revalidatePath("/admin/discounts");
  redirect("/admin/discounts?saved=1");
  }

  await prisma.discount.delete({ where: { id } });
  await recordAudit({
    actor: admin,
    action: "discount.deleted",
    target: discount.code,
    ip: await clientIp(),
  });
  revalidatePath("/admin/discounts");
  redirect("/admin/discounts?saved=1");
}
