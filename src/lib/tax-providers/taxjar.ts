import type { TaxProvider, TaxQuoteInput, TaxQuoteResult } from "./types";

const sandbox = process.env.TAXJAR_ENV !== "production";

function base() {
  return process.env.TAXJAR_API_BASE ?? (sandbox ? "https://api.sandbox.taxjar.com" : "https://api.taxjar.com");
}

/**
 * TaxJar calculates US sales tax (and EU VAT with a Plus plan) per destination.
 * Rates come back as a decimal fraction; we convert to basis points so the rest
 * of the app keeps one unit.
 */
export const taxJarProvider: TaxProvider = {
  code: "taxjar",
  label: "TaxJar",

  isConfigured() {
    return Boolean(process.env.TAXJAR_API_TOKEN);
  },

  async quote(input: TaxQuoteInput): Promise<TaxQuoteResult> {
    const token = process.env.TAXJAR_API_TOKEN;
    if (!token) throw new Error("TaxJar is not configured");

    const toDollars = (minor: number) => (minor / 100).toFixed(2);

    const res = await fetch(`${base()}/v2/taxes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to_country: input.country.toUpperCase(),
        to_zip: process.env.TAXJAR_DEFAULT_ZIP ?? "00000",
        to_state: (input.region ?? "").toUpperCase() || undefined,
        amount: toDollars(input.subtotal),
        shipping: toDollars(input.shipping),
        line_items: input.lineItems.map((l) => ({
          id: l.id,
          quantity: l.quantity,
          unit_price: toDollars(l.unitPrice),
        })),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`TaxJar failed (${res.status}): ${detail.slice(0, 160)}`);
    }

    const json = (await res.json()) as {
      tax: {
        amount_to_collect: number | string;
        rate: number | string;
        breakdown?: {
          line_items?: Array<{ id: string; tax_collectable: number | string; combined_tax_rate: number | string }>;
          tax_summary?: Array<{ rate?: number | string; tax_collectable?: number | string }>;
        };
      };
    };

    const amount = Math.round(Number(json.tax.amount_to_collect) * 100);
    const rate = Math.round(Number(json.tax.rate) * 10000);
    const summary = json.tax.breakdown?.tax_summary ?? [];

    return {
      rate,
      amount,
      label: "Sales tax",
      breakdown:
        summary.length > 0
          ? summary
              .filter((s) => Number(s.tax_collectable ?? 0) > 0)
              .map((s, i) => ({
                label: `Tax ${i + 1}`,
                rate: Math.round(Number(s.rate ?? 0) * 10000),
                amount: Math.round(Number(s.tax_collectable ?? 0) * 100),
              }))
          : [{ label: "Sales tax", rate, amount }],
      source: "taxjar",
    };
  },
};
