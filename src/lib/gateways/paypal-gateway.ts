import { createHash, timingSafeEqual } from "node:crypto";
import type {
  GatewayEvent,
  PaymentGateway,
  PaymentMethodCode,
  RefundInput,
  RefundResult,
  StartPaymentInput,
  StartPaymentResult,
} from "./types";

const live = process.env.PAYPAL_ENV === "live";
const BASE_URL = live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

/** Tests can point the adapter at a local stub, same trick as Stripe. */
function apiBase() {
  return process.env.PAYPAL_API_BASE ?? BASE_URL;
}

export const paypalConfigured = Boolean(
  process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
);

async function accessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal is not configured");

  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

function toDecimal(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

export const paypalGateway: PaymentGateway = {
  code: "paypal",
  label: "PayPal",

  supports(method: PaymentMethodCode) {
    return method === "paypal";
  },

  isConfigured() {
    return paypalConfigured;
  },

  async start(input: StartPaymentInput): Promise<StartPaymentResult> {
    const token = await accessToken();
    const currency = input.currency.toUpperCase();
    const amount = (base: number) => toDecimal(Math.round(base * input.fxRate));

    const items = input.lines.map((line) => ({
      name: `${line.name} — ${line.color} / ${line.size}`.slice(0, 127),
      quantity: String(line.quantity),
      unit_amount: { currency_code: currency, value: amount(line.price) },
    }));
    if (input.shipping > 0) {
      items.push({
        name: "Shipping",
        quantity: "1",
        unit_amount: { currency_code: currency, value: amount(input.shipping) },
      } as (typeof items)[number]);
    }
    if (input.taxAmount > 0) {
      items.push({
        name: (input.taxLabel ?? "Tax").slice(0, 127),
        quantity: "1",
        unit_amount: { currency_code: currency, value: amount(input.taxAmount) },
      } as (typeof items)[number]);
    }

    const total = input.lines.reduce((n, l) => n + l.price * l.quantity, 0) + input.shipping + input.taxAmount;

    const res = await fetch(`${apiBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.orderId,
            custom_id: input.orderId,
            description: `Order ${input.orderId}`.slice(0, 127),
            amount: { currency_code: currency, value: amount(total), breakdown: { item_total: { currency_code: currency, value: amount(total) } } },
            items,
          },
        ],
        application_context: {
          brand_name: "DROP",
          user_action: "PAY_NOW",
          return_url: input.successUrl,
          cancel_url: input.cancelUrl,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`PayPal order failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      id: string;
      links: Array<{ rel: string; href: string }>;
    };
    const approve = json.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
    if (!approve) throw new Error("PayPal did not return an approval link");

    return { kind: "redirect", url: approve.href, reference: json.id };
  },

  async refund(input: RefundInput): Promise<RefundResult> {
    const token = await accessToken();
    const res = await fetch(`${apiBase()}/v2/payments/captures/${input.paymentReference}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: { currency_code: input.currency.toUpperCase(), value: toDecimal(input.amountMinor) },
        ...(input.reason ? { note_to_payer: input.reason.slice(0, 255) } : {}),
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `PayPal refund failed (${res.status})` };
    }
    const json = (await res.json()) as { id: string };
    return { ok: true, reference: json.id };
  },

  async verifyAndParse(request: Request, rawBody: string): Promise<GatewayEvent | null> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId || !paypalConfigured) return null;

    // PayPal signs webhooks with a server-side verification call, not a local HMAC.
    const token = await accessToken();
    const verifyRes = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: request.headers.get("paypal-auth-algo"),
        cert_url: request.headers.get("paypal-cert-url"),
        transmission_id: request.headers.get("paypal-transmission-id"),
        transmission_sig: request.headers.get("paypal-transmission-sig"),
        transmission_time: request.headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    });
    if (!verifyRes.ok) return null;
    const verdict = (await verifyRes.json()) as { verification_status?: string };
    if (verdict.verification_status !== "SUCCESS") return null;

    const event = JSON.parse(rawBody) as {
      event_type: string;
      resource: {
        id?: string;
        custom_id?: string;
        purchase_units?: Array<{ custom_id?: string; reference_id?: string }>;
        amount?: { value?: string; currency_code?: string };
        status?: string;
        supplementary_data?: { related_ids?: { order_id?: string } };
      };
    };

    const resource = event.resource ?? {};
    const orderId =
      resource.custom_id ??
      resource.purchase_units?.[0]?.custom_id ??
      resource.purchase_units?.[0]?.reference_id ??
      null;
    const amountMinor = Math.round(Number(resource.amount?.value ?? 0) * 100);

    switch (event.event_type) {
      case "CHECKOUT.ORDER.APPROVED":
      case "PAYMENT.CAPTURE.COMPLETED":
        return { type: "paid", orderId, reference: resource.id ?? null, amountMinor };
      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED":
        return { type: "failed", orderId, reason: event.event_type };
      case "PAYMENT.CAPTURE.REFUNDED":
        return { type: "refunded", orderId, amountMinor, reference: resource.id ?? null };
      default:
        return { type: "ignored" };
    }
  },
};

/** Kept for the shared-secret path used by local testing. */
export function paypalSignatureFallback(rawBody: string, signature: string | null) {
  const secret = process.env.PAYPAL_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHash("sha256").update(`${secret}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
