import { stripeClient } from "../gateways/stripe-gateway";
import type { TaxProvider, TaxQuoteInput, TaxQuoteResult } from "./types";

/**
 * Stripe Tax needs a customer address and product tax codes to be accurate.
 * We send a calculation with line items so the returned amount matches what
 * Stripe Checkout will charge when the session is created with automatic tax.
 */
export const stripeTaxProvider: TaxProvider = {
  code: "stripe_tax",
  label: "Stripe Tax",

  isConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_TAX_ENABLED === "true");
  },

  async quote(input: TaxQuoteInput): Promise<TaxQuoteResult> {
    const stripe = stripeClient();
    if (!stripe) throw new Error("Stripe is not configured");

    const currency = input.currency.toLowerCase();
    const result = await stripe.tax.calculations.create({
      currency,
      line_items: input.lineItems.map((l) => ({
        amount: Math.round(l.unitPrice),
        quantity: l.quantity,
        reference: l.id,
        ...(l.taxCode ? { tax_code: l.taxCode } : {}),
      })),
      customer_details: {
        address: { country: input.country.toUpperCase(), state: input.region ?? undefined },
        address_source: "shipping",
      },
      shipping_cost: input.shipping > 0 ? { amount: Math.round(input.shipping) } : undefined,
    });

    const amount = result.tax_amount_exclusive + result.tax_amount_inclusive;
    const taxable = result.amount_total - amount;
    const rate = taxable > 0 ? Math.round((amount / taxable) * 10000) : 0;

    return {
      rate,
      amount,
      label: "Tax",
      breakdown: [{ label: "Tax", rate, amount }],
      source: "stripe_tax",
    };
  },
};
