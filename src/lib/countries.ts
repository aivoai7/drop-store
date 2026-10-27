/** Country names used by the checkout form, mapped to ISO codes.
 *  Tax rules and shipping restrictions are keyed by code, never by name. */
export const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
  { code: "CN", name: "China" },
  { code: "CH", name: "Switzerland" },
  { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "SE", name: "Sweden" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "KR", name: "South Korea" },
  { code: "NZ", name: "New Zealand" },
] as const;

export function countryCode(input: string | null | undefined): string {
  if (!input) return "US";
  const value = input.trim();
  if (value.length === 2) return value.toUpperCase();
  const match = COUNTRIES.find((c) => c.name.toLowerCase() === value.toLowerCase());
  return match?.code ?? value.toUpperCase();
}

export function countryName(code: string) {
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;
}
