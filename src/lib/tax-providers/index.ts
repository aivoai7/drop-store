import type { TaxProvider, TaxQuoteInput, TaxQuoteResult } from "./types";
import { localTaxProvider } from "./local";
import { taxJarProvider } from "./taxjar";
import { stripeTaxProvider } from "./stripe-tax";

export const providers: TaxProvider[] = [stripeTaxProvider, taxJarProvider, localTaxProvider];

export async function activeProvider(): Promise<TaxProvider> {
  const requested = process.env.TAX_PROVIDER;
  if (requested) {
    for (const p of providers) {
      if (p.code === requested && (await p.isConfigured())) return p;
    }
  }
  for (const p of providers) {
    if (p.code !== "local" && (await p.isConfigured())) return p;
  }
  return localTaxProvider;
}

/**
 * External engines can be down or misconfigured; charging the wrong tax is worse
 * than charging the locally configured one, so we fall back rather than fail.
 */
export async function quoteTax(input: TaxQuoteInput): Promise<TaxQuoteResult> {
  const provider = await activeProvider();
  if (provider.code === "local") return provider.quote(input);

  try {
    return await provider.quote(input);
  } catch (err) {
    console.error(`[tax] ${provider.code} failed, falling back to local rates`, err);
    const fallback = await localTaxProvider.quote(input);
    return { ...fallback, source: `${fallback.source} (fallback from ${provider.code})` };
  }
}

export type { TaxProvider, TaxQuoteInput, TaxQuoteResult } from "./types";
