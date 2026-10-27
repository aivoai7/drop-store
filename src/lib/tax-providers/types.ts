export type TaxQuoteInput = {
  country: string;
  region: string | null;
  /** Amounts in the base currency's minor unit. */
  subtotal: number;
  shipping: number;
  currency: string;
  /** Line items help external engines classify products. */
  lineItems: Array<{ id: string; quantity: number; unitPrice: number; taxCode?: string }>;
};

export type TaxQuoteResult = {
  /** Basis points, for a single blended line. */
  rate: number;
  amount: number;
  label: string | null;
  /** Providers that break tax down (US state + county) return each component. */
  breakdown: Array<{ label: string; rate: number; amount: number }>;
  source: string;
};

export interface TaxProvider {
  readonly code: string;
  readonly label: string;
  isConfigured(): boolean | Promise<boolean>;
  quote(input: TaxQuoteInput): Promise<TaxQuoteResult>;
}
