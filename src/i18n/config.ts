export const locales = ["en", "zh", "ja", "de", "fr", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "DROP_LOCALE";

export const localeMeta: Record<Locale, { label: string; native: string; htmlLang: string; currency: string }> = {
  en: { label: "English", native: "English", htmlLang: "en", currency: "usd" },
  zh: { label: "Chinese", native: "简体中文", htmlLang: "zh-CN", currency: "usd" },
  ja: { label: "Japanese", native: "日本語", htmlLang: "ja", currency: "usd" },
  de: { label: "German", native: "Deutsch", htmlLang: "de", currency: "eur" },
  fr: { label: "French", native: "Français", htmlLang: "fr", currency: "eur" },
  es: { label: "Spanish", native: "Español", htmlLang: "es", currency: "eur" },
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Picks the best locale from an Accept-Language header. */
export function matchLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
    // Chinese variants all map to zh.
    if (base === "zh") return "zh";
  }
  return defaultLocale;
}
