import Link from "next/link";
import { priceIn, type DisplayCurrency } from "@/lib/price-format";
import type { ProductView } from "@/lib/catalog";
import type { Locale } from "@/i18n/config";
import { localiseProduct } from "@/lib/product-i18n";

export function ProductCard({
  product,
  locale,
  currency,
}: {
  product: ProductView;
  locale: Locale;
  currency: DisplayCurrency;
}) {
  const text = localiseProduct(product, locale);

  return (
    <Link href={`/${locale}/product/${product.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden bg-neutral-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.images[0]}
          alt={text.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        {product.badge && (
          <span className="absolute left-3 top-3 bg-lime-400 px-2 py-1 text-[11px] font-black tracking-widest text-black">
            {product.badge}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold uppercase tracking-wide">{text.name}</p>
          <p className="truncate text-xs text-neutral-400">{text.tagline}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">{priceIn(product.price, currency)}</p>
          {product.compareAt && (
            <p className="text-xs text-neutral-500 line-through">{priceIn(product.compareAt, currency)}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
