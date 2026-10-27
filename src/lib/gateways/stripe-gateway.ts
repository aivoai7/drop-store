import Stripe from "stripe";
import { getGatewaySecrets } from "../gateway-config";
import type {
  GatewayEvent,
  PaymentGateway,
  PaymentMethodCode,
  RefundInput,
  RefundResult,
  StartPaymentInput,
  StartPaymentResult,
} from "./types";

let client: Stripe | null = null;
/** The secret the cached client was built with; rebuilds when admin saves new keys. */
let clientSecret: string | null = null;

function stubConfig(): Partial<Stripe.StripeConfig> {
  const base = process.env.STRIPE_API_BASE;
  if (!base) return {};
  const [host, port] = base.split(":");
  return port ? { host, port: Number(port), protocol: "http" } : { host: base, protocol: "http" };
}

function buildClient(secret: string): Stripe {
  if (!client || clientSecret !== secret) {
    client = new Stripe(secret, {
      apiVersion: "2026-09-30.endive" as Stripe.LatestApiVersion,
      appInfo: { name: "DROP Store" },
      ...stubConfig(),
    });
    clientSecret = secret;
  }
  return client;
}

/** Resolves the active secret key: DB row first, env fallback second. */
async function activeSecret(): Promise<{ secret: string; source: "db" | "env" } | null> {
  const { stripe } = await getGatewaySecrets();
  if (!stripe?.secretKey) return null;
  return { secret: stripe.secretKey, source: stripe.source };
}

async function webhookSecret(): Promise<string | null> {
  const { stripe } = await getGatewaySecrets();
  return stripe?.webhookSecret ?? null;
}

/**
 * Stripe handles cards plus the wallet rails. Apple Pay and Google Pay are not
 * separate integrations: they surface inside Stripe Checkout when the domain is
 * registered with Stripe and the device supports it.
 */
export const stripeGateway: PaymentGateway = {
  code: "stripe",
  label: "Stripe",

  supports(method: PaymentMethodCode) {
    return method === "card" || method === "apple_pay" || method === "google_pay";
  },

  async isConfigured() {
    const active = await activeSecret();
    return active?.source ?? null;
  },

  async start(input: StartPaymentInput): Promise<StartPaymentResult> {
    const active = await activeSecret();
    if (!active) throw new Error("Stripe is not configured");
    const stripe = buildClient(active.secret);

    const amount = (base: number) => Math.round(base * input.fxRate);
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = input.lines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: input.currency.toUpperCase(),
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
        price_data: {
          currency: input.currency.toUpperCase(),
          unit_amount: amount(input.shipping),
          product_data: { name: "Shipping" },
        },
      });
    }
    if (input.taxAmount > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: input.currency.toUpperCase(),
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
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    return { kind: "redirect", url: session.url ?? "", reference: session.id };
  },

  async refund(input: RefundInput): Promise<RefundResult> {
    const active = await activeSecret();
    if (!active) return { ok: false, reason: "Stripe is not configured" };
    const stripe = buildClient(active.secret);
    try {
      const refund = await stripe.refunds.create({
        payment_intent: input.paymentReference,
        amount: input.amountMinor,
        ...(input.reason ? { metadata: { reason: input.reason.slice(0, 200) } } : {}),
      });
      return { ok: true, reference: refund.id };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "Stripe refund failed" };
    }
  },

  async verifyAndParse(request: Request, rawBody: string): Promise<GatewayEvent | null> {
    const secret = await webhookSecret();
    if (!secret) return null;
    const active = await activeSecret();
    if (!active) return null;
    const stripe = buildClient(active.secret);

    const signature = request.headers.get("stripe-signature");
    if (!signature) return null;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      return null;
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          type: "paid",
          orderId: session.client_reference_id ?? session.metadata?.orderId ?? null,
          reference:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null,
          amountMinor: session.amount_total ?? 0,
        };
      }
      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed": {
        const object = event.data.object as { metadata?: Record<string, string> };
        return { type: "failed", orderId: object.metadata?.orderId ?? null, reason: event.type };
      }
      case "charge.refunded":
      case "refund.created":
      case "refund.updated": {
        const object = event.data.object as {
          id: string;
          payment_intent?: string | { id: string } | null;
          amount?: number;
          status?: string;
        };
        if (object.status === "failed" || object.status === "canceled") return { type: "ignored" };
        return {
          type: "refunded",
          orderId: null,
          amountMinor: object.amount ?? 0,
          reference: typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id ?? null,
        };
      }
      default:
        return { type: "ignored" };
    }
  },
};

export { Stripe };
