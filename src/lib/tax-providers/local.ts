import { computeTax, resolveTaxRate } from "../tax";
import type { TaxProvider, TaxQuoteInput, TaxQuoteResult } from "./types";

/**
 * Uses the rates configured in /admin/tax. This is the default and the
 * fallback when an external engine is unreachable.
 */
export const localTaxProvider: TaxProvider = {
  code: "local",
  label: "Manual rates",

  isConfigured() {
    return true;
  },

  async quote(input: TaxQuoteInput): Promise<TaxQuoteResult> {
    const resolved = await resolveTaxRate(input.country, input.region);
    const result = await computeTax({
      taxableBase: input.subtotal + input.shipping,
      country: input.country,
      region: input.region,
      taxEnabled: true,
      fallbackRate: 0,
      pricesIncludeTax: false,
    });
    return {
      rate: result.rate || resolved.rate,
      amount: result.amount,
      label: result.label,
      breakdown: result.lines,
      source: "local",
    };
  },
};
