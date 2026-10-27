export type DisplayCurrency = {
  code: string;
  name: string;
  symbol: string;
  rate: number;
  decimals: number;
};

export const CURRENCY_FALLBACK: DisplayCurrency = {
  code: "usd",
  name: "US Dollar",
  symbol: "$",
  rate: 1,
  decimals: 2,
};

/**
 * Formats a base-currency minor amount in the display currency.
 * Pure — safe to import from client components.
 */
export function priceIn(amountMinor: number, currency: DisplayCurrency) {
  const converted = Math.round(amountMinor * currency.rate);
  const value = converted / 100;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  });
  return `${currency.symbol}${formatted}`;
}

export function makePriceFormatter(currency: DisplayCurrency) {
  return (amountMinor: number) => priceIn(amountMinor, currency);
}

export const CURRENCY_COOKIE = "DROP_CURRENCY";
