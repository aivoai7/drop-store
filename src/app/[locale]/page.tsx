import { getDisplayCurrency } from "@/lib/display-currency";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale as Locale);

  const currency = await getDisplayCurrency(locale as Locale);
  const products = await getProducts();
  const featured = products.filter((p) => p.featured).slice(0, 4);
  const hero = products[0];
  if (!hero) return null;

  return (
    <div>
      <section className="relative grid min-h-[78vh] place-items-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero.images[0]} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />
        <div className="relative px-4 text-center">
          <p className="text-xs font-black tracking-[0.4em] text-lime-400">{t("hero.badge")}</p>
          <h1 className="mt-4 text-6xl font-black uppercase leading-none tracking-tight sm:text-8xl">
            {t("hero.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-neutral-300">{t("hero.subtitle")}</p>
          <Link
            href={`/${locale}/shop`}
            className="mt-8 inline-block bg-lime-400 px-8 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white"
          >
            {t("hero.cta")}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-3xl font-black uppercase tracking-tight">{t("home.featured")}</h2>
          <Link href={`/${locale}/shop`} className="text-xs font-bold uppercase tracking-widest text-lime-400">
            {t("home.viewAll")} →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale as Locale} currency={currency} />
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-16 md:grid-cols-3">
        {[
          [t("nav.sneakers"), `/${locale}/shop?category=sneakers`, "1549298916-b41d501d3772"],
          [t("nav.bags"), `/${locale}/shop?category=bags`, "1584917865442-de89df76afd3"],
          [t("nav.apparel"), `/${locale}/shop?category=apparel`, "1591047139829-d91aecb6caea"],
        ].map(([label, href, photo]) => (
          <Link key={href} href={href} className="group relative aspect-[4/3] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://images.unsplash.com/photo-${photo}?auto=format&fit=crop&w=900&q=80`}
              alt={label}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40" />
            <span className="absolute bottom-4 left-4 text-2xl font-black uppercase tracking-wide">{label}</span>
          </Link>
        ))}
      </section>

      <section className="border-y border-white/10 bg-lime-400 py-10 text-black">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-6 px-4 text-center text-sm font-black uppercase tracking-widest">
          <span>{t("home.perks.shipping")}</span>
          <span>{t("home.perks.returns")}</span>
          <span>{t("home.perks.worldwide")}</span>
          <span>{t("home.perks.secure")}</span>
        </div>
      </section>
    </div>
  );
}
