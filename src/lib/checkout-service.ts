import { prisma } from "./db";
import { getSettings } from "./store-settings";

import { quoteTax } from "./tax-providers";
import { pickShippingMethod } from "./shipping";
import { convert, getCurrency } from "./currency";

export type CheckoutLine = {
  productId: string;
  variantId: string;
  quantity: number;
};

export type PricedLine = {
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  size: string;
  color: string;
  image?: string;
};

export type Quote = {
  subtotal: number;
  shipping: number;
  shippingMethodId: string;
  shippingMethodName: string;
  taxAmount: number;
  taxRate: number;
  taxLabel: string | null;
  discountAmount: number;
  total: number;
  currency: string;
  fxRate: number;
  /** Amounts above are in the base currency; these are what the customer sees. */
  display: {
    subtotal: number;
    shipping: number;
    tax: number;
    discount: number;
    total: number;
  };
};

/**
 * Re-prices a client cart from the database. Nothing the browser sends about
 * price, name or stock is trusted.
 */
export async function priceLines(lines: CheckoutLine[]) {
  const [products, variants] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } }),
    prisma.variant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } } }),
  ]);

  const priced: PricedLine[] = [];
  const problems: string[] = [];

  for (const line of lines) {
    const variant = variants.find((v) => v.id === line.variantId);
    const product = variant && products.find((p) => p.id === variant.productId);
    if (!variant || !product) {
      problems.push("A product in your bag is no longer available.");
      continue;
    }
    if (product.status !== "active") {
      problems.push(`${product.name} is no longer for sale.`);
      continue;
    }
    if (variant.stock < line.quantity) {
      problems.push(`Only ${variant.stock} left of ${product.name} in ${variant.color} / ${variant.size}.`);
      continue;
    }
    priced.push({
      productId: product.id,
      variantId: variant.id,
      sku: variant.sku,
      name: product.name,
      price: variant.price ?? product.price,
      quantity: line.quantity,
      size: variant.size,
      color: variant.color,
      image: (JSON.parse(product.images) as string[])[0],
    });
  }

  return { priced, problems };
}

export type QuoteInput = {
  country: string;
  region?: string | null;
  currency?: string;
  shippingMethodId?: string | null;
  discountAmount?: number;
};

/** One place that turns a priced cart into the numbers shown at checkout. */
export async function quote(input: { lines: PricedLine[] } & QuoteInput): Promise<Quote> {
  const settings = await getSettings();
  const subtotal = input.lines.reduce((n, i) => n + i.price * i.quantity, 0);

  const method = await pickShippingMethod({
    methodId: input.shippingMethodId,
    country: input.country,
    subtotal,
    globalFreeOver: settings.freeShippingThreshold,
  });

  const discountAmount = Math.min(input.discountAmount ?? 0, subtotal);
  const discountedGoods = subtotal - discountAmount;

  const taxableBase =
    discountedGoods + (settings.taxShipping || settings.taxBasis === "shipping" ? method.price : 0);

  let tax: { rate: number; amount: number; label: string | null; lines: Array<{ label: string; rate: number; amount: number }> } = {
    rate: 0,
    amount: 0,
    label: null,
    lines: [],
  };

  if (settings.taxEnabled) {
    const external = await quoteTax({
      country: input.country,
      region: input.region ?? null,
      subtotal: settings.taxBasis === "shipping" ? taxableBase : discountedGoods,
      shipping: settings.taxShipping ? method.price : 0,
      currency: input.currency ?? settings.baseCurrency,
      lineItems: input.lines.map((l) => ({
        id: l.variantId,
        quantity: l.quantity,
        unitPrice: l.price,
      })),
    });

    // Prices-inclusive stores extract tax instead of adding it.
    const amount = settings.pricesIncludeTax
      ? Math.round((discountedGoods + method.price) - (discountedGoods + method.price) / (1 + external.rate / 10000))
      : external.amount;

    tax = { rate: external.rate, amount, label: external.label, lines: external.breakdown };
  }

  const total = settings.pricesIncludeTax
    ? discountedGoods + method.price
    : discountedGoods + method.price + tax.amount;

  const currencyRow = input.currency ? await getCurrency(input.currency) : null;
  const fxRate = currencyRow?.rate ?? 1;

  return {
    subtotal,
    shipping: method.price,
    shippingMethodId: method.id,
    shippingMethodName: method.name,
    taxAmount: tax.amount,
    taxRate: tax.rate,
    taxLabel: tax.label,
    discountAmount,
    total,
    currency: currencyRow?.code ?? settings.baseCurrency,
    fxRate,
    display: {
      subtotal: convert(subtotal, fxRate),
      shipping: convert(method.price, fxRate),
      tax: convert(tax.amount, fxRate),
      discount: convert(discountAmount, fxRate),
      total: convert(total, fxRate),
    },
  };
}
