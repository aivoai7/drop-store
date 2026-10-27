"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getAdminUser } from "./auth";
import { recordAudit } from "./audit";
import { clientIp } from "./request";
import { canEdit, canManageAdmins } from "./permissions";
import { updateSettings } from "./store-settings";
import { adminPath } from "@/lib/admin-path";

async function requireEditor() {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  if (!canEdit(admin.role)) redirect(adminPath("/settings?denied=1"));
  return admin;
}

const cents = (raw: FormDataEntryValue | null) => {
  const value = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const int = (raw: FormDataEntryValue | null, fallback = 0) => {
  const n = Number(String(raw ?? "").replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
};

export async function saveStoreSettings(formData: FormData) {
  const admin = await requireEditor();

  await updateSettings({
    taxEnabled: formData.get("taxEnabled") === "on",
    taxBasis: String(formData.get("taxBasis") ?? "shipping") === "billing" ? "billing" : "shipping",
    taxShipping: formData.get("taxShipping") === "on",
    pricesIncludeTax: formData.get("pricesIncludeTax") === "on",
    fallbackTaxRate: int(formData.get("fallbackTaxRate")),
    freeShippingThreshold: cents(formData.get("freeShippingThreshold")),
    invoicePrefix: String(formData.get("invoicePrefix") ?? "INV").slice(0, 8) || "INV",
    invoiceShowTaxId: formData.get("invoiceShowTaxId") === "on",
  });

  await recordAudit({
    actor: admin,
    action: "settings.updated",
    target: "store",
    ip: await clientIp(),
  });
  revalidatePath(adminPath("/settings"));
  revalidatePath("/checkout");
  redirect(adminPath("/settings?saved=1"));
}

/* ---------------- tax ---------------- */

export async function createTaxRate(formData: FormData) {
  const admin = await requireEditor();
  const country = String(formData.get("country") ?? "").trim().toUpperCase();
  const region = String(formData.get("region") ?? "").trim().toUpperCase() || null;
  const label = String(formData.get("label") ?? "").trim();
  const rate = int(formData.get("rate"));

  if (!country || !label) redirect("/admin/tax?error=Country and label are required");
  if (rate <= 0 || rate > 5000) redirect("/admin/tax?error=Rate must be between 0.01% and 50%");

  await prisma.taxRate.create({ data: { country, region, label, rate } });
  await recordAudit({ actor: admin, action: "tax.created", target: `${country}${region ? `/${region}` : ""}`, metadata: { label, rate }, ip: await clientIp() });
  revalidatePath(adminPath("/tax"));
  redirect(adminPath("/tax?saved=1"));
}

export async function updateTaxRate(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id"));
  const rate = int(formData.get("rate"));
  const label = String(formData.get("label") ?? "").trim();
  const active = formData.get("active") === "on";
  if (!label || rate <= 0) redirect("/admin/tax?error=Invalid rate");

  await prisma.taxRate.update({ where: { id }, data: { label, rate, active } });
  revalidatePath(adminPath("/tax"));
  redirect(adminPath("/tax?saved=1"));
}

export async function deleteTaxRate(formData: FormData) {
  await requireEditor();
  await prisma.taxRate.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(adminPath("/tax"));
  redirect(adminPath("/tax?saved=1"));
}

/* ---------------- shipping ---------------- */

export async function createShippingMethod(formData: FormData) {
  const admin = await requireEditor();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) redirect("/admin/shipping?error=Name is required");

  const countries = String(formData.get("countries") ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const method = await prisma.shippingMethod.create({
    data: {
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      price: cents(formData.get("price")),
      freeOver: formData.get("freeOver") ? cents(formData.get("freeOver")) : null,
      minSubtotal: formData.get("minSubtotal") ? cents(formData.get("minSubtotal")) : 0,
      countries: countries.length ? JSON.stringify(countries) : null,
      position: await prisma.shippingMethod.count(),
    },
  });
  await recordAudit({ actor: admin, action: "shipping.created", target: method.name, ip: await clientIp() });
  revalidatePath(adminPath("/shipping"));
  redirect(adminPath("/shipping?saved=1"));
}

export async function updateShippingMethod(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id"));
  await prisma.shippingMethod.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      price: cents(formData.get("price")),
      freeOver: formData.get("freeOver") ? cents(formData.get("freeOver")) : null,
      active: formData.get("active") === "on",
    },
  });
  revalidatePath(adminPath("/shipping"));
  redirect(adminPath("/shipping?saved=1"));
}

export async function deleteShippingMethod(formData: FormData) {
  await requireEditor();
  await prisma.shippingMethod.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(adminPath("/shipping"));
  redirect(adminPath("/shipping?saved=1"));
}

/* ---------------- currencies ---------------- */

export async function createCurrency(formData: FormData) {
  const admin = await requireEditor();
  const code = String(formData.get("code") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const symbol = String(formData.get("symbol") ?? "").trim();
  const rate = Number(String(formData.get("rate") ?? "").replace(/[^0-9.]/g, ""));

  if (!/^[a-z]{3}$/.test(code)) redirect("/admin/currencies?error=Use a 3-letter code such as eur");
  if (!name || !symbol) redirect("/admin/currencies?error=Name and symbol are required");
  if (!Number.isFinite(rate) || rate <= 0) redirect("/admin/currencies?error=Rate must be greater than zero");

  const clash = await prisma.currency.findUnique({ where: { code } });
  if (clash) redirect("/admin/currencies?error=That currency already exists");

  const currency = await prisma.currency.create({
    data: {
      code,
      name,
      symbol,
      rate,
      decimals: int(formData.get("decimals"), 2),
      position: await prisma.currency.count(),
    },
  });
  await recordAudit({ actor: admin, action: "currency.created", target: currency.code, metadata: { rate }, ip: await clientIp() });
  revalidatePath(adminPath("/currencies"));
  redirect(adminPath("/currencies?saved=1"));
}

export async function updateCurrency(formData: FormData) {
  await requireEditor();
  const code = String(formData.get("code"));
  const rate = Number(String(formData.get("rate") ?? "").replace(/[^0-9.]/g, ""));
  if (code === "usd" && rate !== 1) redirect("/admin/currencies?error=The base currency rate is always 1");

  await prisma.currency.update({
    where: { code },
    data: {
      rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
      active: formData.get("active") === "on",
      decimals: int(formData.get("decimals"), 2),
    },
  });
  revalidatePath(adminPath("/currencies"));
  redirect(adminPath("/currencies?saved=1"));
}

export async function deleteCurrency(formData: FormData) {
  await requireEditor();
  const code = String(formData.get("code"));
  if (code === "usd") redirect("/admin/currencies?error=The base currency can't be removed");
  await prisma.currency.delete({ where: { code } });
  revalidatePath(adminPath("/currencies"));
  redirect(adminPath("/currencies?saved=1"));
}

/* ---------------- payment methods ---------------- */

export async function updatePaymentMethod(formData: FormData) {
  const admin = await requireEditor();
  const code = String(formData.get("code"));
  const enabled = formData.get("enabled") === "on";
  const instructions = String(formData.get("instructions") ?? "").trim() || null;

  await prisma.paymentMethod.update({ where: { code }, data: { enabled, instructions } });
  await recordAudit({ actor: admin, action: "paymentmethod.updated", target: code, metadata: { enabled }, ip: await clientIp() });
  revalidatePath(adminPath("/payment-methods"));
  redirect(adminPath("/payment-methods?saved=1"));
}

export { canManageAdmins };
