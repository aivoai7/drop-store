import { cookies } from "next/headers";
import { prisma } from "./db";
import { getSettings } from "./store-settings";
import type { Locale } from "@/i18n/config";
import { localeMeta } from "@/i18n/config";
import { CURRENCY_FALLBACK, CURRENCY_COOKIE, priceIn, type DisplayCurrency } from "./price-format";

export { CURRENCY_FALLBACK, CURRENCY_COOKIE, priceIn };
export type { DisplayCurrency };

/**
 * What currency the storefront should show.
 *
 * Precedence: explicit visitor choice (cookie) > locale default > base currency.
 * The locale mapping is a starting point, not a lock — the switcher can override.
 */
export async function getDisplayCurrency(locale: Locale): Promise<DisplayCurrency> {
  const [cookieStore, settings, currencies] = await Promise.all([
    cookies(),
    getSettings(),
    prisma.currency.findMany({ where: { active: true } }),
  ]);

  const active = (code: string) => currencies.find((c) => c.code === code.toLowerCase() && c.active);
  const toDisplay = (c: (typeof currencies)[number]): DisplayCurrency => ({
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    rate: c.rate,
    decimals: c.decimals,
  });

  const chosen = cookieStore.get(CURRENCY_COOKIE)?.value;
  if (chosen) {
    const match = active(chosen);
    if (match) return toDisplay(match);
  }

  const baseRow = active(settings.baseCurrency);
  const base: DisplayCurrency = baseRow ? toDisplay(baseRow) : CURRENCY_FALLBACK;

  const localeDefault = localeMeta[locale]?.currency;
  if (localeDefault && localeDefault !== base.code) {
    const match = active(localeDefault);
    if (match) return toDisplay(match);
  }

  return base;
}
