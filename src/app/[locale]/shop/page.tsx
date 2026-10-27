import { getDisplayCurrency } from "@/lib/display-currency";
import { notFound } from "next/navigation";
import { getCategories, getProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string; q?: string; sort?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale as Locale);

  const { category, q, sort } = await searchParams;
  const currency = await getDisplayCurrency(locale as Locale);
  const [categories, all] = await Promise.all([getCategories(), getProducts(category)]);

  const query = (q ?? "").trim().toLowerCase();
  let products = query
    ? all.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.tagline.toLowerCase().includes(query) ||
          p.category.name.toLowerCase().includes(query),
      )
    : all;

  if (sort === "price-asc") products = [...products].sort((a, b) => a.price - b.price);
  if (sort === "price-desc") products = [...products].sort((a, b) => b.price - a.price);

  const filters = [
    { label: t("shop.all"), href: `/${locale}/shop` },
    ...categories.map((c) => ({ label: c.name, href: `/${locale}/shop?category=${c.slug}` })),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight">
            {query ? t("shop.resultsFor", { query: q ?? "" }) : category ?? t("shop.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">{t("shop.results", { count: products.length })}</p>
        </div>
        <form className="flex gap-2 text-sm">
          {category && <input type="hidden" name="category" value={category} />}
          {q && <input type="hidden" name="q" value={q} />}
          <select
            name="sort"
            defaultValue={sort ?? ""}
            className="border border-white/20 bg-black px-3 py-2 uppercase tracking-wider"
          >
            <option value="">{t("shop.sortNewest")}</option>
            <option value="price-asc">{t("shop.sortPriceAsc")}</option>
            <option value="price-desc">{t("shop.sortPriceDesc")}</option>
          </select>
          <button className="bg-white px-4 py-2 font-bold uppercase tracking-wider text-black">
            {t("shop.sort")}
          </button>
        </form>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = f.href === (category ? `/${locale}/shop?category=${category}` : `/${locale}/shop`);
          return (
            <a
              key={f.href}
              href={f.href}
              className={`border px-4 py-2 text-xs font-bold uppercase tracking-widest ${
                active ? "border-lime-400 bg-lime-400 text-black" : "border-white/20 hover:border-white"
              }`}
            >
              {f.label}
            </a>
          );
        })}
      </div>

      {products.length === 0 ? (
        <p className="py-24 text-center text-neutral-400">{t("shop.empty")}</p>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale as Locale} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}
