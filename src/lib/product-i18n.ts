import type { Locale } from "@/i18n/config";

/**
 * Product copy is authored in English. Translations live in a JSON blob on the
 * product row so merchandisers can add languages without a schema change.
 */
export type ProductTranslations = Partial<
  Record<Locale, { name?: string; tagline?: string; description?: string }>
>;

export function parseTranslations(raw: string | null | undefined): ProductTranslations {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as ProductTranslations) : {};
  } catch {
    return {};
  }
}

export function localiseProduct(
  product: { name: string; tagline: string; description: string; translations?: string | null },
  locale: Locale,
) {
  const translations = parseTranslations(product.translations);
  const override = translations[locale];
  return {
    name: override?.name?.trim() || product.name,
    tagline: override?.tagline?.trim() || product.tagline,
    description: override?.description?.trim() || product.description,
    translated: Boolean(override?.name || override?.tagline || override?.description),
  };
}
