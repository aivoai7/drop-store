import Stripe from "stripe";
import { prisma } from "./db";
import { absolute } from "./site";
import { sendEmail } from "./email";
import { gatewayByCode } from "./gateways";
import { getGatewaySecrets } from "./gateway-config";
import type { PaymentMethodCode } from "./gateways/types";
import { refundEmail } from "./email-templates";

/**
 * Stripe is optional: without a key (DB row or env) the store falls back to the
 * demo checkout. Both sources are checked because admin-saved keys live in the
 * database; this is a helper page export, so it stays a snapshot of env only —
 * pages that need the live answer await stripeGateway.isConfigured().
 */
export const stripeEnabled = Boolean(process.env.STRIPE_SECRET_KEY);

let client: Stripe | null = null;
let clientSecret: string | null = null;

/** Splits STRIPE_API_BASE ("127.0.0.1:4545") into the host/port/protocol the SDK wants. */
function stubConfig(): Partial<Stripe.StripeConfig> {
  const base = process.env.STRIPE_API_BASE;
  if (!base) return {};
  const [host, port] = base.split(":");
  return port
    ? { host, port: Number(port), protocol: "http" }
    : { host: base, protocol: "http" };
}

async function getStripe(): Promise<Stripe | null> {
  const { stripe: secrets } = await getGatewaySecrets();
  if (!secrets?.secretKey) return null;
  if (!client || clientSecret !== secrets.secretKey) {
    client = new Stripe(secrets.secretKey, {
      apiVersion: "2026-09-30.endive" as Stripe.LatestApiVersion,
      appInfo: { name: "DROP Store" },
      ...stubConfig(),
    });
    clientSecret = secrets.secretKey;
  }
  return client;
}

export type CheckoutLine = {
  name: string;
  price: number;
  quantity: number;
  size: string;
  color: string;
  image?: string;
};

export type { PaymentMethodCode };

export async function createStripeCheckout(input: {
  orderId: string;
  email: string;
  lines: CheckoutLine[];
  shipping: number;
  taxAmount?: number;
  taxLabel?: string | null;
  currency?: string;
  fxRate?: number;
}) {
  const stripe = await getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const currency = (input.currency ?? "usd").toUpperCase();
  const fx = input.fxRate ?? 1;
  // Stripe charges in the presentation currency; amounts convert at the order's rate.
  const amount = (base: number) => Math.round(base * fx);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = input.lines.map((line) => ({
    quantity: line.quantity,
    price_data: {
      currency,
      unit_amount: amount(line.price),
      product_data: {
        name: `${line.name} — ${line.color} / ${line.size}`,
        ...(line.image ? { images: [line.image] } : {}),
      },
    },
  }));

  if (input.shipping > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency, unit_amount: amount(input.shipping), product_data: { name: "Shipping" } },
    });
  }

  if (input.taxAmount && input.taxAmount > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: amount(input.taxAmount),
        product_data: { name: input.taxLabel ?? "Tax" },
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    line_items: lineItems,
    client_reference_id: input.orderId,
    metadata: { orderId: input.orderId },
    payment_intent_data: { metadata: { orderId: input.orderId } },
    success_url: absolute(`/checkout/success?order=${input.orderId}&session_id={CHECKOUT_SESSION_ID}`),
    cancel_url: absolute(`/checkout?cancelled=${input.orderId}`),
  });

  await prisma.order.update({
    where: { id: input.orderId },
    data: { stripeSessionId: session.id, paymentProvider: "stripe" },
  });
  await recordPaymentEvent({
    orderId: input.orderId,
    type: "checkout.session.created",
    amount: 0,
    provider: "stripe",
    reference: session.id,
  });

  return session;
}

export async function recordPaymentEvent(input: {
  orderId: string;
  type: string;
  amount: number;
  provider?: string | null;
  reference?: string | null;
  actor?: string | null;
  note?: string | null;
}) {
  await prisma.paymentEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      amount: input.amount,
      provider: input.provider ?? null,
      reference: input.reference ?? null,
      actor: input.actor ?? null,
      note: input.note ?? null,
    },
  });
}

export type RefundResult =
  | { ok: true; amount: number; partial: boolean; provider: string }
  | { ok: false; reason: string };

/**
 * Refunds through Stripe when there is a payment intent; otherwise it settles
 * the refund locally so demo and manual/offline payments can still be reversed.
 */
export async function refundOrder(input: {
  orderId: string;
  amount?: number;
  reason?: string;
  actorEmail: string;
}): Promise<RefundResult> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) return { ok: false, reason: "Order not found" };
  if (!["paid", "partially_refunded"].includes(order.paymentStatus)) {
    return { ok: false, reason: `Order is ${order.paymentStatus}, so there is nothing to refund` };
  }

  const alreadyRefunded = order.refundAmount ?? 0;
  const refundable = order.total - alreadyRefunded;
  if (refundable <= 0) return { ok: false, reason: "This order has already been fully refunded" };

  const amount = Math.min(input.amount ?? refundable, refundable);
  if (amount <= 0) return { ok: false, reason: "Refund amount must be greater than zero" };

  let reference: string | null = null;
  const providerCode = order.paymentProvider ?? "manual";
  const gateway = gatewayByCode(providerCode);
  const gatewayRef = order.stripePaymentIntentId ?? order.paymentReference;

  if (gateway && gatewayRef) {
    const result = await gateway.refund({
      orderId: order.id,
      paymentReference: gatewayRef,
      amountMinor: amount,
      currency: order.currency,
      reason: input.reason,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    reference = result.reference;
  }

  const totalRefunded = alreadyRefunded + amount;
  const fullyRefunded = totalRefunded >= order.total;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      refundAmount: totalRefunded,
      refundReason: input.reason ?? order.refundReason ?? null,
      refundedByAdminEmail: input.actorEmail,
      ...(fullyRefunded
        ? { paymentStatus: "refunded", refundedAt: new Date() }
        : { paymentStatus: "partially_refunded" }),
    },
  });

  await recordPaymentEvent({
    orderId: order.id,
    type: fullyRefunded ? "refund.full" : "refund.partial",
    amount,
    provider: gateway ? gateway.code : (order.paymentProvider ?? "manual"),
    reference,
    actor: input.actorEmail,
    note: input.reason ?? null,
  });

  const mail = refundEmail({
    name: order.name,
    orderId: order.id,
    amount,
    partial: !fullyRefunded,
    reason: input.reason ?? null,
  });
  await sendEmail({ to: order.email, ...mail, template: "refund" });

  return {
    ok: true,
    amount,
    partial: !fullyRefunded,
    provider: gateway ? gateway.code : (order.paymentProvider ?? "manual"),
  };
}

/** Marks an order paid without going through Stripe (bank transfer, cash, POS). */
export async function markOrderPaidManually(input: {
  orderId: string;
  actorEmail: string;
  note?: string;
}) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) return { ok: false as const, reason: "Order not found" };
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
    return { ok: false as const, reason: `Order is already ${order.paymentStatus}` };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "paid",
      status: order.status === "pending" ? "paid" : order.status,
      paymentProvider: order.paymentProvider ?? "manual",
    },
  });
  await recordPaymentEvent({
    orderId: order.id,
    type: "payment.manual",
    amount: order.total,
    provider: "manual",
    actor: input.actorEmail,
    note: input.note ?? null,
  });
  return { ok: true as const, amount: order.total };
}

/** Captures a Stripe session from the admin, e.g. after a webhook was missed. */
export async function syncFromStripe(orderId: string) {
  const stripe = await getStripe();
  if (!stripe) return { ok: false as const, reason: "Stripe is not configured" };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false as const, reason: "Order not found" };
  if (!order.stripeSessionId) return { ok: false as const, reason: "This order has no Stripe session" };

  const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  if (session.payment_status !== "paid") {
    return { ok: false as const, reason: `Stripe reports payment_status=${session.payment_status}` };
  }
  if (order.paymentStatus === "paid") {
    return { ok: true as const, alreadyPaid: true, amount: order.total };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "paid",
      status: order.status === "pending" ? "paid" : order.status,
      stripePaymentIntentId: paymentIntent,
    },
  });
  await recordPaymentEvent({
    orderId: order.id,
    type: "payment.synced",
    amount: session.amount_total ?? order.total,
    provider: "stripe",
    reference: session.id,
    actor: "stripe-sync",
  });
  return { ok: true as const, alreadyPaid: false, amount: order.total };
}
