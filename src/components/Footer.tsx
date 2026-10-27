import Link from "next/link";
import { translator } from "@/i18n";
import type { Locale } from "@/i18n/config";

export function Footer({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <footer className="mt-auto border-t border-white/10 bg-black">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <p className="text-lg font-black tracking-[0.25em]">DROP</p>
          <p className="mt-2 max-w-xs text-sm text-neutral-400">{t("brand.tagline")}</p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <Link href={`/${locale}/shop`} className="hover:text-lime-400">{t("footer.shopAll")}</Link>
          <Link href={`/${locale}/account`} className="hover:text-lime-400">{t("footer.myAccount")}</Link>
          <Link href="/admin" className="hover:text-lime-400">{t("footer.admin")}</Link>
        </div>
        <div className="text-sm text-neutral-400">
          <p>{t("home.perks.shipping")}</p>
          <p>{t("home.perks.returns")}</p>
          <p className="mt-3 text-xs">{t("footer.rights", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
