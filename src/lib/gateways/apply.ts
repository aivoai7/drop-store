import { prisma } from "../db";
import { sendOrderConfirmation } from "../orders";
import { reserveOrderStock } from "../stock";
import { recordPaymentEvent } from "../payments";
import type { GatewayCode, GatewayEvent } from "./types";

export type ApplyResult = { applied: string; orderId?: string };

/**
 * Single place where a gateway event turns into order state. Both webhook
 * endpoints call this, so Stripe and PayPal can never drift apart.
 */
export async function applyGatewayEvent(
  gateway: GatewayCode,
  event: GatewayEvent,
): Promise<ApplyResult> {
  if (event.type === "ignored") return { applied: "ignored" };

  // Refunds arrive without an order id; resolve them by the provider reference.
  if (event.type === "refunded") {
    const order =
      (event.reference
        ? await prisma.order.findFirst({
            where: {
              OR: [{ stripePaymentIntentId: event.reference }, { paymentReference: event.reference }],
            },
          })
        : null) ?? null;

    if (!order) return { applied: "refund-no-order" };

    const totalRefunded = order.refundAmount + event.amountMinor;
    const fully = totalRefunded >= order.total;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        refundAmount: totalRefunded,
        paymentStatus: fully ? "refunded" : "partially_refunded",
        refundedAt: fully ? new Date() : order.refundedAt,
      },
    });
    await recordPaymentEvent({
      orderId: order.id,
      type: "refund.confirmed",
      amount: event.amountMinor,
      provider: gateway,
      reference: event.reference,
      actor: `${gateway}-webhook`,
    });
    return { applied: fully ? "refund-full" : "refund-partial", orderId: order.id };
  }

  if (!event.orderId) return { applied: `${event.type}-no-order` };

  const order = await prisma.order.findUnique({
    where: { id: event.orderId },
    include: { items: true },
  });
  if (!order) return { applied: `${event.type}-unknown-order` };

  if (event.type === "failed") {
    if (order.paymentStatus === "paid") return { applied: "failed-ignored-paid" };
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "failed" } });
    await recordPaymentEvent({
      orderId: order.id,
      type: "payment.failed",
      amount: 0,
      provider: gateway,
      note: event.reason,
    });
    return { applied: "failed", orderId: order.id };
  }

  // type === "paid"
  if (order.paymentStatus === "paid") return { applied: "already-paid", orderId: order.id };

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "paid",
      status: order.status === "pending" ? "paid" : order.status,
      paymentReference: event.reference,
      stripePaymentIntentId: gateway === "stripe" ? event.reference : order.stripePaymentIntentId,
    },
    include: { items: true },
  });

  await reserveOrderStock(updated.id);
  await recordPaymentEvent({
    orderId: updated.id,
    type: "payment.succeeded",
    amount: updated.total,
    provider: gateway,
    reference: event.reference,
  });
  await sendOrderConfirmation(updated);

  return { applied: "paid", orderId: updated.id };
}
