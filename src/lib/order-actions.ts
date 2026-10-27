"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getAdminUser } from "./auth";
import { recordAudit } from "./audit";
import { clientIp } from "./request";
import { restoreOrderStock } from "./stock";
import { refundOrder, markOrderPaidManually, syncFromStripe } from "./payments";
import { canEdit } from "./permissions";
import { sendEmail } from "./email";
import { shippingEmail } from "./email-templates";

async function requireEditor() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if (!canEdit(admin.role)) redirect("/admin?denied=1");
  return admin;
}

export async function updateOrderStatus(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const backTo = String(formData.get("backTo") ?? "/admin/orders");
  if (!["pending", "paid", "shipped", "cancelled"].includes(status)) redirect(backTo);

  const before = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!before) redirect(backTo);

  const data: Record<string, unknown> = { status };
  if (status === "shipped" && !before.shippedAt) data.shippedAt = new Date();
  if (status === "cancelled" && !before.cancelledAt) data.cancelledAt = new Date();

  await prisma.order.update({ where: { id }, data });

  if (status === "cancelled" && before.status !== "cancelled") {
    await restoreOrderStock(id);
  }

  await recordAudit({
    actor: admin,
    action: "order.status.changed",
    target: id,
    metadata: { from: before.status, to: status },
    ip: await clientIp(),
  });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  redirect(backTo);
}

export async function shipOrder(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const carrier = String(formData.get("carrier") ?? "").trim();
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim();
  const backTo = String(formData.get("backTo") ?? "/admin/orders");

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) redirect(backTo);
  if (!trackingNumber) redirect(`${backTo}?error=tracking-required`);

  await prisma.order.update({
    where: { id },
    data: {
      carrier: carrier || null,
      trackingNumber,
      status: "shipped",
      shippedAt: order.shippedAt ?? new Date(),
    },
  });

  const mail = shippingEmail({
    name: order.name,
    orderId: order.id,
    carrier: carrier || null,
    trackingNumber,
  });
  await sendEmail({ to: order.email, ...mail, template: "order-shipped" });

  await recordAudit({
    actor: admin,
    action: "order.shipped",
    target: id,
    metadata: { carrier, trackingNumber },
    ip: await clientIp(),
  });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  redirect(backTo);
}

export async function updateOrderDetails(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const backTo = String(formData.get("backTo") ?? `/admin/orders/${id}`);

  const data = {
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    adminNote: String(formData.get("adminNote") ?? "").trim() || null,
  };
  if (!data.name || !data.address || !data.city || !data.country) {
    redirect(`${backTo}?error=missing-fields`);
  }

  const before = await prisma.order.findUnique({ where: { id } });
  if (!before) redirect("/admin/orders");

  await prisma.order.update({ where: { id }, data });
  await recordAudit({
    actor: admin,
    action: "order.details.updated",
    target: id,
    metadata: {
      address: before.address !== data.address ? { from: before.address, to: data.address } : undefined,
    },
    ip: await clientIp(),
  });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  redirect(backTo);
}

export async function refundOrderAction(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const backTo = String(formData.get("backTo") ?? "/admin/orders");
  const ip = await clientIp();

  const rawAmount = String(formData.get("amount") ?? "").replace(/[^0-9.]/g, "");
  const amountCents = rawAmount ? Math.round(Number(rawAmount) * 100) : undefined;
  const reason = String(formData.get("reason") ?? "").trim() || undefined;

  const result = await refundOrder({
    orderId: id,
    amount: amountCents,
    reason,
    actorEmail: admin.email,
  });

  if (!result.ok) {
    await recordAudit({
      actor: admin,
      action: "order.refund.failed",
      target: id,
      metadata: { message: result.reason },
      ip,
    });
    redirect(`${backTo}?error=${encodeURIComponent(result.reason)}`);
  }

  await recordAudit({
    actor: admin,
    action: result.partial ? "order.partially_refunded" : "order.refunded",
    target: id,
    metadata: { amount: result.amount, provider: result.provider, reason },
    ip,
  });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/payments");
  redirect(`${backTo}?refunded=1`);
}

export async function markPaidAction(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim() || undefined;
  const backTo = String(formData.get("backTo") ?? `/admin/orders/${id}`);
  const ip = await clientIp();

  const result = await markOrderPaidManually({ orderId: id, actorEmail: admin.email, note });
  if (!result.ok) redirect(`${backTo}?error=${encodeURIComponent(result.reason)}`);

  await recordAudit({
    actor: admin,
    action: "order.payment.manual",
    target: id,
    metadata: { amount: result.amount, note },
    ip,
  });
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/payments");
  redirect(`${backTo}?paid=1`);
}

export async function syncPaymentAction(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id"));
  const backTo = String(formData.get("backTo") ?? `/admin/orders/${id}`);
  const ip = await clientIp();

  const result = await syncFromStripe(id);
  if (!result.ok) redirect(`${backTo}?error=${encodeURIComponent(result.reason)}`);

  await recordAudit({
    actor: admin,
    action: "order.payment.synced",
    target: id,
    metadata: { amount: result.amount, alreadyPaid: result.alreadyPaid },
    ip,
  });
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/payments");
  redirect(`${backTo}?paid=1`);
}