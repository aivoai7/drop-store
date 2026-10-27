import { getDisplayCurrency, priceIn } from "@/lib/display-currency";
import { notFound } from "next/navigation";
import { getProduct, getProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";
import { AddToCart } from "./AddToCart";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { localiseProduct } from "@/lib/product-i18n";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale as Locale);

  const currency = await getDisplayCurrency(locale as Locale);
  const product = await getProduct(slug);
  if (!product) notFound();

  const copy = localiseProduct(product, locale as Locale);

  const related = (await getProducts(product.category.slug))
    .filter((p) => p.id !== product.id)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">
        <a href={`/${locale}/shop`} className="hover:text-white">{t("product.breadcrumbShop")}</a>
        {" / "}
        <a href={`/${locale}/shop?category=${product.category.slug}`} className="hover:text-white">
          {product.category.name}
        </a>
      </p>
      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <div className="grid gap-3">
          {product.images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={copy.name}
              className="aspect-square w-full bg-neutral-900 object-cover"
            />
          ))}
        </div>
        <div className="md:sticky md:top-24 md:self-start">
          {product.badge && (
            <span className="bg-lime-400 px-2 py-1 text-[11px] font-black tracking-widest text-black">
              {product.badge}
            </span>
          )}
          <h1 className="mt-3 text-4xl font-black uppercase tracking-tight">{copy.name}</h1>
          <p className="mt-1 text-neutral-400">{copy.tagline}</p>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-bold">{priceIn(product.price, currency)}</span>
            {product.compareAt && (
              <span className="text-neutral-500 line-through">{priceIn(product.compareAt, currency)}</span>
            )}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-neutral-300">{copy.description}</p>
          <AddToCart product={product} locale={locale as Locale} />
          <ul className="mt-8 space-y-2 border-t border-white/10 pt-6 text-xs uppercase tracking-widest text-neutral-400">
            <li>{t("product.freeShipping")}</li>
            <li>{t("product.returns")}</li>
            <li>
              {product.stock > 0 ? t("product.inStock", { count: product.stock }) : t("product.soldOut")}
            </li>
          </ul>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="text-2xl font-black uppercase tracking-tight">{t("product.youMayLike")}</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} locale={locale as Locale} currency={currency} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
