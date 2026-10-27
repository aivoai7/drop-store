import type { Dictionary } from "./dictionaries/en";
import { en } from "./dictionaries/en";
import { zh } from "./dictionaries/zh";
import { ja } from "./dictionaries/ja";
import { de } from "./dictionaries/de";
import { fr } from "./dictionaries/fr";
import { es } from "./dictionaries/es";
import type { Locale } from "./config";

export const dictionaries: Record<Locale, Dictionary> = { en, zh, ja, de, fr, es };

export type Translate = (key: keyof Dictionary, vars?: Record<string, string | number>) => string;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? en;
}

/** Fills {placeholders}; unknown keys fall back to English, then to the key itself. */
export function translator(locale: Locale): Translate {
  const dict = getDictionary(locale);
  return (key, vars) => {
    const template = dict[key] ?? en[key] ?? String(key);
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name) =>
      vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
    );
  };
}

export type { Dictionary };
export { locales, defaultLocale, localeMeta, isLocale, matchLocale, LOCALE_COOKIE } from "./config";
export type { Locale } from "./config";
