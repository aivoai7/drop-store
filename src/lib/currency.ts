import { prisma } from "./db";

export type CurrencyRow = {
  code: string;
  name: string;
  symbol: string;
  rate: number;
  decimals: number;
};

/**
 * All product/order amounts are stored in the base currency's minor unit.
 * A presentation currency converts at the edge; the order row keeps the rate
 * it was charged at so history never drifts when rates change.
 */
export function convert(amountMinor: number, rate: number) {
  return Math.round(amountMinor * rate);
}

export function formatCurrency(amountMinor: number, currency: Pick<CurrencyRow, "symbol" | "decimals">) {
  const value = amountMinor / 100;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  });
  return `${currency.symbol}${formatted}`;
}

export async function getActiveCurrencies(): Promise<CurrencyRow[]> {
  return prisma.currency.findMany({
    where: { active: true },
    orderBy: { position: "asc" },
    select: { code: true, name: true, symbol: true, rate: true, decimals: true },
  });
}

export async function getCurrency(code: string): Promise<CurrencyRow | null> {
  return prisma.currency.findUnique({
    where: { code: code.toLowerCase() },
    select: { code: true, name: true, symbol: true, rate: true, decimals: true },
  });
}

export const DEFAULT_CURRENCY: CurrencyRow = {
  code: "usd",
  name: "US Dollar",
  symbol: "$",
  rate: 1,
  decimals: 2,
};
