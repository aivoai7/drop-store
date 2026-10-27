import { NextResponse } from "next/server";
import { forwardToGo } from "@/lib/go-api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { priceLines, quote } from "@/lib/checkout-service";
import { validateDiscount, recordRedemption } from "@/lib/discounts";
import { gatewayFor } from "@/lib/gateways";
import { absolute } from "@/lib/site";
import { rateLimit, formatRetry } from "@/lib/rate-limit";
import { clientIp, clientIpFrom } from "@/lib/request";
import { sendOrderConfirmation } from "@/lib/orders";
import { recordPaymentEvent } from "@/lib/payments";
import { reserveOrderStock } from "@/lib/stock";
import { getMethod } from "@/lib/payment-methods";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  region: z.string().max(60).optional().nullable(),
  country: z.string().min(1),
  currency: z.string().max(3).optional(),
  shippingMethodId: z.string().optional().nullable(),
  paymentMethod: z.string().max(30).optional(),
  discountCode: z.string().max(40).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string(),
        quantity: z.number().int().positive().max(20),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  // Defense in depth: the boot instrumentation already verifies the code
  // signature; a second check here catches runtime-patched modules.
  const { verifyIntegrity } = await import("../../../../scripts/vendor-verify.mjs");
  verifyIntegrity();
  // Delegate to the Go service when it is configured.
  const raw = await request.text();
  const proxied = await forwardToGo("/v1/checkout", {
    body: raw,
    cookie: request.headers.get("cookie") ?? undefined,
    ip: clientIpFrom(request),
  });
  if (proxied) return NextResponse.json(proxied.body, { status: proxied.status });

  request = new Request(request.url, { method: "POST", body: raw, headers: request.headers });
  const ip = await clientIp();
  const limit = await rateLimit(`checkout:${ip}`, 20, 10 * 60);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many checkout attempts. Try again in ${formatRetry(limit.retryAfterSeconds)}.` },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid order" }, { status: 400 });

  const { items, discountCode, paymentMethod, ...customer } = parsed.data;
  const user = await getSessionUser();

  const { priced, problems } = await priceLines(items);
  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0], details: problems }, { status: 409 });
  }

  const goodsSubtotal = priced.reduce((n, l) => n + l.price * l.quantity, 0);

  // Per-email discount limits use the account email when signed in — the
  // order email is client-typed and rotating it would dodge reuse caps.
  const discountEmail = (user?.email ?? customer.email).toLowerCase();

  let discount: { id: string; code: string; amount: number } | null = null;
  if (discountCode) {
    const result = await validateDiscount(discountCode, {
      subtotal: goodsSubtotal,
      email: discountEmail,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    discount = { id: result.discount.id, code: result.discount.code, amount: result.amount };
  }

  const pricedQuote = await quote({
    lines: priced,
    country: customer.country,
    region: customer.region,
    currency: customer.currency,
    shippingMethodId: customer.shippingMethodId,
    discountAmount: discount?.amount ?? 0,
  });

  if (pricedQuote.display.total <= 0) {
    return NextResponse.json({ error: "Order total must be greater than zero" }, { status: 400 });
  }

  // Payment method must be one the store actually offers.
  const requestedMethod = paymentMethod ?? "card";
  const method = await getMethod(requestedMethod);
  if (!method || !method.enabled) {
    return NextResponse.json({ error: "That payment method isn't available" }, { status: 422 });
  }

  const id = `DRP-${Date.now().toString(36).toUpperCase()}`;
  // Whether a method settles online is decided by the gateway that handles it,
  // not by the `automated` flag in the database (PayPal is stored as non-automated
  // because it redirects, but it still settles through its own API).
  const gateway = gatewayFor(method.code as never);

  const order = await prisma.order.create({
    data: {
      id,
      ...customer,
      region: customer.region ?? null,
      userId: user?.id ?? null,
      subtotal: pricedQuote.subtotal,
      shipping: pricedQuote.shipping,
      taxAmount: pricedQuote.taxAmount,
      taxRate: pricedQuote.taxRate,
      taxLabel: pricedQuote.taxLabel,
      discountCode: discount?.code ?? null,
      discountAmount: discount?.amount ?? 0,
      total: pricedQuote.total,
      currency: pricedQuote.currency,
      fxRate: pricedQuote.fxRate,
      paymentMethod: method.code,
      shippingMethodId: pricedQuote.shippingMethodId,
      status: "pending",
      paymentStatus: "pending",
      paymentProvider: gateway?.code ?? method.code,
      items: {
        create: priced.map((line, idx) => ({
          id: `${id}-${idx}`,
          productId: line.productId,
          variantId: line.variantId,
          sku: line.sku,
          name: line.name,
          price: line.price,
          quantity: line.quantity,
          size: line.size,
          color: line.color,
        })),
      },
    },
    include: { items: true },
  });

  if (discount) {
    await recordRedemption({
      discountId: discount.id,
      orderId: order.id,
      email: discountEmail,
      amount: discount.amount,
    });
  }

  if (gateway) {
    try {
      const started = await gateway.start({
        orderId: order.id,
        email: customer.email,
        amountMinor: pricedQuote.display.total,
        currency: pricedQuote.currency,
        lines: priced,
        shipping: pricedQuote.shipping,
        taxAmount: pricedQuote.taxAmount,
        taxLabel: pricedQuote.taxLabel,
        fxRate: pricedQuote.fxRate,
        successUrl: absolute(`/checkout/success?order=${order.id}`),
        cancelUrl: absolute(`/checkout?cancelled=${order.id}`),
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { stripeSessionId: gateway.code === "stripe" ? started.reference : null },
      });
      await recordPaymentEvent({
        orderId: order.id,
        type: "payment.started",
        amount: 0,
        provider: gateway.code,
        reference: started.reference,
      });

      if (started.kind === "redirect") {
        return NextResponse.json({ orderId: order.id, redirectUrl: started.url });
      }
      return NextResponse.json({ orderId: order.id, redirectUrl: `/checkout/success?order=${order.id}` });
    } catch (err) {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "failed", status: "cancelled" },
      });
      console.error("[checkout] gateway start failed", err);
      return NextResponse.json({ error: "Payment could not be started" }, { status: 502 });
    }
  }

  if (!method.automated) {
    // Nothing to capture yet — the order waits for the courier or the transfer.
    await recordPaymentEvent({
      orderId: order.id,
      type: "payment.awaiting",
      amount: 0,
      provider: method.code,
      note: method.instructions,
    });
    return NextResponse.json({
      orderId: order.id,
      redirectUrl: `/checkout/success?order=${order.id}`,
    });
  }

  // Demo mode card settlement: same code path, minus the money.
  const paid = await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: "paid", status: "paid" },
    include: { items: true },
  });
  await reserveOrderStock(paid.id);
  await recordPaymentEvent({
    orderId: paid.id,
    type: "payment.demo",
    amount: paid.total,
    provider: method.code,
  });
  await sendOrderConfirmation(paid);

  return NextResponse.json({ orderId: paid.id, redirectUrl: `/checkout/success?order=${paid.id}` });
}
