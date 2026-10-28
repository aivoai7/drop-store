import Link from "next/link";
import { translator } from "@/i18n";
import type { Locale } from "@/i18n/config";

const CATEGORY_HREFS = [
  { slug: "sneakers", key: "nav.sneakers" },
  { slug: "bags", key: "nav.bags" },
  { slug: "apparel", key: "nav.apparel" },
] as const;

export function Footer({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-white/10 bg-neutral-950 text-white">
      {/* Perks strip */}
      <div className="border-b border-white/10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-3 px-4 py-5 text-[11px] font-black uppercase tracking-widest text-neutral-300 sm:grid-cols-4">
          <span>{t("home.perks.shipping")}</span>
          <span>{t("home.perks.returns")}</span>
          <span>{t("home.perks.worldwide")}</span>
          <span>{t("home.perks.secure")}</span>
        </div>
      </div>

      {/* Main grid */}
      <div className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          {/* Brand block */}
          <div>
            <p className="text-4xl font-black tracking-[0.2em] sm:text-5xl">DROP</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-400">
              {t("brand.tagline")}
            </p>
          </div>

          {/* Shop links */}
          <nav aria-label="Shop" className="text-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
              {t("footer.headingShop")}
            </p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href={`/${locale}/shop`} className="text-neutral-300 hover:text-lime-400">
                  {t("footer.shopAll")}
                </Link>
              </li>
              {CATEGORY_HREFS.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/${locale}/shop?category=${c.slug}`}
                    className="text-neutral-300 hover:text-lime-400"
                  >
                    {t(c.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Account links */}
          <nav aria-label="Account" className="text-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
              {t("footer.headingAccount")}
            </p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href={`/${locale}/account`} className="text-neutral-300 hover:text-lime-400">
                  {t("footer.myAccount")}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/signup`} className="text-neutral-300 hover:text-lime-400">
                  {t("auth.signUp")}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/login`} className="text-neutral-300 hover:text-lime-400">
                  {t("auth.signIn")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Legal bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-[11px] text-neutral-500">
          <p>{t("footer.rights", { year })}</p>
          <p className="font-black uppercase tracking-[0.3em] text-neutral-600">DROP {year}</p>
        </div>
      </div>
    </footer>
  );
}
