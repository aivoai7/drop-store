"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductView } from "@/lib/catalog";
import { useCart } from "@/lib/cart-store";
import { translator } from "@/i18n";
import type { Locale } from "@/i18n/config";

export function AddToCart({ product, locale }: { product: ProductView; locale: Locale }) {
  const t = translator(locale);
  const [size, setSize] = useState(product.sizes[0]);
  const [color, setColor] = useState(product.colors[0]);
  const [added, setAdded] = useState(false);
  const add = useCart((s) => s.add);
  const router = useRouter();

  const variant = useMemo(
    () => product.variants.find((v) => v.color === color && v.size === size),
    [product.variants, color, size],
  );
  const stock = variant?.stock ?? 0;
  const soldOut = stock <= 0;

  const sizeStock = (candidate: string) => {
    const match = product.variants.find((v) => v.color === color && v.size === candidate);
    return match?.stock ?? 0;
  };

  function onAdd() {
    if (!variant || soldOut) return;
    add({
      productId: product.id,
      variantId: variant.id,
      slug: product.slug,
      name: product.name,
      price: variant.price,
      image: product.images[0],
      size,
      color,
      maxQuantity: variant.stock,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  const chip = (active: boolean, disabled = false) =>
    `border px-3 py-2 text-xs font-bold uppercase tracking-wider ${
      active ? "border-lime-400 bg-lime-400 text-black" : "border-white/30 hover:border-white"
    } ${disabled ? "cursor-not-allowed opacity-30 line-through hover:border-white/30" : ""}`;

  return (
    <div className="mt-8">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">{t("product.color")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {product.colors.map((c) => (
          <button key={c} onClick={() => setColor(c)} className={chip(c === color)}>
            {c}
          </button>
        ))}
      </div>
      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-neutral-400">{t("product.size")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {product.sizes.map((s) => {
          const qty = sizeStock(s);
          return (
            <button
              key={s}
              onClick={() => setSize(s)}
              disabled={qty === 0}
              className={chip(s === size, qty === 0)}
              title={qty === 0 ? "Sold out" : `${qty} left`}
            >
              {s}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] uppercase tracking-widest text-neutral-500">
        {soldOut
          ? t("product.soldOutCombo")
          : t("product.leftIn", { count: stock, color, size })}
      </p>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onAdd}
          disabled={soldOut}
          className="flex-1 bg-lime-400 py-4 text-sm font-black uppercase tracking-widest text-black hover:bg-white disabled:bg-neutral-700 disabled:text-neutral-400"
        >
          {soldOut ? t("product.soldOut") : added ? t("product.added") : t("product.addToBag")}
        </button>
        <button
          onClick={() => {
            onAdd();
            if (!soldOut) router.push(`/${locale}/cart`);
          }}
          disabled={soldOut}
          className="border border-white px-6 py-4 text-sm font-black uppercase tracking-widest hover:bg-white hover:text-black disabled:opacity-40"
        >
          {t("product.buyNow")}
        </button>
      </div>
    </div>
  );
}
