import { prisma } from "./db";

/**
 * Rates are "units of this currency per 1 base unit" (USD = 1).
 * Providers return a map, we only take codes we actually support.
 */
export type RateMap = Record<string, number>;

const OPEN_EXCHANGE = "https://openexchangerates.org/api/latest.json";
const EXCHANGE_RATE_API = "https://v6.exchangerate-api.com/v6";
// Keyless endpoint of the same ExchangeRate-API service; daily updates, no
// signup. Used as the fallback so real rates work out of the box.
const ER_API_OPEN = "https://open.er-api.com/v6/latest";

type Provider = "openexchangerates" | "exchangerate-api" | "erapi-open" | "manual";

function configuredProvider(): Provider {
  const forced = process.env.EXCHANGE_RATE_PROVIDER;
  if (forced === "openexchangerates" && process.env.OPEN_EXCHANGE_RATES_APP_ID) return "openexchangerates";
  if (forced === "exchangerate-api" && process.env.EXCHANGE_RATE_API_KEY) return "exchangerate-api";
  if (forced === "erapi-open") return "erapi-open";
  if (process.env.OPEN_EXCHANGE_RATES_APP_ID) return "openexchangerates";
  if (process.env.EXCHANGE_RATE_API_KEY) return "exchangerate-api";
  // No keys anywhere: fall back to the free keyless feed.
  return "erapi-open";
}

export function exchangeRatesConfigured() {
  return configuredProvider() !== "manual";
}

/** USD-based rates from the provider. */
async function fetchRates(base: string): Promise<RateMap> {
  const provider = configuredProvider();

  if (provider === "openexchangerates") {
    const key = process.env.OPEN_EXCHANGE_RATES_APP_ID;
    const url = process.env.EXCHANGE_RATE_API_BASE ?? OPEN_EXCHANGE;
    const res = await fetch(`${url}?app_id=${key}&base=${base.toUpperCase()}`);
    if (!res.ok) throw new Error(`Open Exchange Rates failed (${res.status})`);
    const json = (await res.json()) as { rates: RateMap };
    return json.rates;
  }

  if (provider === "exchangerate-api") {
    const key = process.env.EXCHANGE_RATE_API_KEY;
    const host = process.env.EXCHANGE_RATE_API_BASE ?? EXCHANGE_RATE_API;
    const res = await fetch(`${host}/${key}/latest/${base.toUpperCase()}`);
    if (!res.ok) throw new Error(`ExchangeRate-API failed (${res.status})`);
    const json = (await res.json()) as { conversion_rates: RateMap };
    return json.conversion_rates;
  }

  const res = await fetch(`${ER_API_OPEN}/${base.toUpperCase()}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ExchangeRate-API open feed failed (${res.status})`);
  const json = (await res.json()) as { rates: RateMap; result?: string };
  if (json.result && json.result !== "success") throw new Error("ExchangeRate-API open feed returned an error");
  return json.rates;
}

export type RefreshResult = {
  ok: boolean;
  provider: string;
  updated: Array<{ code: string; from: number; to: number }>;
  skipped: string[];
  error?: string;
};

/**
 * Pulls fresh rates for every active non-base currency. The base currency is
 * pinned at 1 and never fetched. Rates are stored as-is, so an upstream outage
 * leaves the last known rate in place rather than zeroing everything out.
 */
export async function refreshExchangeRates(baseCurrency = "usd"): Promise<RefreshResult> {
  const provider = configuredProvider();
  const base = baseCurrency.toLowerCase();

  if (provider === "manual") {
    return {
      ok: false,
      provider,
      updated: [],
      skipped: [],
      error: "No exchange-rate provider configured.",
    };
  }

  let rates: RateMap;
  try {
    rates = await fetchRates(base);
  } catch (err) {
    return {
      ok: false,
      provider,
      updated: [],
      skipped: [],
      error: err instanceof Error ? err.message : "Rate fetch failed",
    };
  }

  const currencies = await prisma.currency.findMany({ where: { active: true } });
  const updated: RefreshResult["updated"] = [];
  const skipped: string[] = [];

  for (const currency of currencies) {
    if (currency.code === base) {
      if (currency.rate !== 1) {
        await prisma.currency.update({ where: { code: currency.code }, data: { rate: 1 } });
        updated.push({ code: currency.code, from: currency.rate, to: 1 });
      }
      continue;
    }

    const upstream = rates[currency.code.toUpperCase()];
    // Base-relative: provider gives per-base units already.
    if (typeof upstream !== "number" || !Number.isFinite(upstream) || upstream <= 0) {
      skipped.push(currency.code);
      continue;
    }
    const next = Number(upstream.toFixed(6));
    if (next === currency.rate) {
      skipped.push(currency.code);
      continue;
    }
    await prisma.currency.update({ where: { code: currency.code }, data: { rate: next } });
    updated.push({ code: currency.code, from: currency.rate, to: next });
  }

  return { ok: true, provider, updated, skipped };
}
