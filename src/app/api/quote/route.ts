import { NextResponse } from "next/server";
import { forwardToGo } from "@/lib/go-api";
import { z } from "zod";
import { priceLines, quote } from "@/lib/checkout-service";
import { validateDiscount } from "@/lib/discounts";
import { getSessionUser } from "@/lib/auth";
import { getActiveCurrencies, getCurrency } from "@/lib/currency";
import { getEnabledMethods } from "@/lib/payment-methods";
import { shippingOptions } from "@/lib/shipping";
import { getSettings } from "@/lib/store-settings";
import { formatCurrency, convert } from "@/lib/currency";

export const dynamic = "force-dynamic";

const schema = z.object({
  country: z.string().min(1).optional(),
  region: z.string().max(60).optional().nullable(),
  currency: z.string().max(3).optional(),
  shippingMethodId: z.string().optional().nullable(),
  discountCode: z.string().max(40).optional().nullable(),
  items: z.array(z.object({ productId: z.string(), variantId: z.string(), quantity: z.number().int().positive().max(20) })),
});

/** Single pricing endpoint so cart, checkout and the client never disagree. */
export async function POST(request: Request) {
  // The Go service owns pricing when configured; TS stays as the fallback.
  const raw = await request.text();
  const proxied = await forwardToGo("/v1/quote", { body: raw });
  if (proxied) return NextResponse.json(proxied.body, { status: proxied.status });

  const parsed = schema.safeParse(JSON.parse(raw || "null"));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { priced, problems } = await priceLines(parsed.data.items);
  if (problems.length > 0) return NextResponse.json({ error: problems[0], problems }, { status: 409 });

  const settings = await getSettings();
  const country = parsed.data.country || "US";
  const goodsSubtotal = priced.reduce((n, l) => n + l.price * l.quantity, 0);

  let discountAmount = 0;
  let discountCode: string | null = null;
  if (parsed.data.discountCode) {
    const user = await getSessionUser();
    const result = await validateDiscount(parsed.data.discountCode, {
      subtotal: goodsSubtotal,
      email: user?.email,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    discountAmount = result.amount;
    discountCode = result.discount.code;
  }

  const q = await quote({
    lines: priced,
    country,
    region: parsed.data.region,
    currency: parsed.data.currency,
    shippingMethodId: parsed.data.shippingMethodId,
    discountAmount,
  });

  const options = await shippingOptions({
    country,
    subtotal: goodsSubtotal - discountAmount,
    globalFreeOver: settings.freeShippingThreshold,
  });
  const [currencies, methods, currency] = await Promise.all([
    getActiveCurrencies(),
    getEnabledMethods(),
    getCurrency(q.currency),
  ]);
  const cur = currency ?? { code: "usd", name: "US Dollar", symbol: "$", rate: 1, decimals: 2 };

  return NextResponse.json({
    lines: priced.map((l) => ({
      variantId: l.variantId,
      unit: formatCurrency(convert(l.price, q.fxRate), cur),
    })),
    currency: { code: cur.code, symbol: cur.symbol, decimals: cur.decimals },
    currencies,
    paymentMethods: methods.map((m) => ({
      code: m.code,
      name: m.name,
      description: m.description,
      instructions: m.instructions,
      automated: m.automated,
    })),
    shippingOptions: options.map((o) => ({
      ...o,
      display: formatCurrency(convert(o.price, q.fxRate), cur),
    })),
    shippingMethodId: q.shippingMethodId,
    tax: {
      enabled: settings.taxEnabled,
      rate: q.taxRate,
      label: q.taxLabel,
      display: formatCurrency(convert(q.taxAmount, q.fxRate), cur),
    },
    discount: discountCode
      ? { code: discountCode, display: formatCurrency(convert(q.discountAmount, q.fxRate), cur) }
      : null,
    amounts: {
      subtotal: formatCurrency(convert(q.subtotal, q.fxRate), cur),
      shipping: formatCurrency(convert(q.shipping, q.fxRate), cur),
      tax: formatCurrency(convert(q.taxAmount, q.fxRate), cur),
      total: formatCurrency(convert(q.total, q.fxRate), cur),
    },
  });
}
