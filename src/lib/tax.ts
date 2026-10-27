import { prisma } from "./db";
import { countryCode } from "./countries";

export type TaxLine = { label: string; rate: number; amount: number };

export type TaxResult = {
  rate: number;
  amount: number;
  label: string | null;
  lines: TaxLine[];
};

/**
 * Rates are stored in basis points (825 = 8.25%). A country+region row beats a
 * country row, which beats "*". Multiple matching rows are summed, which is how
 * Canadian GST+PST and US state+county stacks work.
 */
const REGION_NAMES: Record<string, string> = {
  california: "CA",
  "new york": "NY",
  texas: "TX",
  florida: "FL",
  illinois: "IL",
  washington: "WA",
};

/** Accepts "CA", "ca" or "California". */
function normaliseRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  const value = region.trim();
  if (!value) return null;
  if (value.length <= 3) return value.toUpperCase();
  return REGION_NAMES[value.toLowerCase()] ?? value.toUpperCase();
}

export async function resolveTaxRate(country: string, region?: string | null): Promise<{
  rate: number;
  label: string | null;
}> {
  const upperCountry = countryCode(country);
  const upperRegion = normaliseRegion(region);

  const rows = await prisma.taxRate.findMany({ where: { active: true } });
  const matches = rows.filter((r) => {
    const countryMatch = r.country === "*" || r.country.toUpperCase() === upperCountry;
    if (!countryMatch) return false;
    if (r.region) return upperRegion !== null && normaliseRegion(r.region) === upperRegion;
    return true;
  });

  if (matches.length === 0) return { rate: 0, label: null };

  // Prefer the most specific tier: region rows win over country-only rows.
  const withRegion = matches.filter((r) => r.region);
  const chosen = withRegion.length > 0 ? withRegion : matches;
  const rate = chosen.reduce((n, r) => n + r.rate, 0);
  const label = chosen.map((r) => r.label).join(" + ");
  return { rate, label };
}

export async function computeTax(input: {
  taxableBase: number;
  country: string;
  region?: string | null;
  taxEnabled: boolean;
  fallbackRate: number;
  pricesIncludeTax: boolean;
}): Promise<TaxResult> {
  if (!input.taxEnabled) return { rate: 0, amount: 0, label: null, lines: [] };

  const resolved = await resolveTaxRate(input.country, input.region);
  const rate = resolved.rate || input.fallbackRate;
  const label = resolved.label ?? (input.fallbackRate ? "Tax" : null);
  if (rate <= 0) return { rate: 0, amount: 0, label: null, lines: [] };

  const amount = input.pricesIncludeTax
    ? // Tax already baked into the price: extract rather than add.
      Math.round(input.taxableBase - input.taxableBase / (1 + rate / 10000))
    : Math.round((input.taxableBase * rate) / 10000);

  return {
    rate,
    amount,
    label,
    lines: [{ label: label ?? "Tax", rate, amount }],
  };
}

export function formatRate(basisPoints: number) {
  return `${(basisPoints / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}
