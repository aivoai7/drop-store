"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCart, itemKey } from "@/lib/cart-store";
import { useCurrency } from "@/components/CurrencyProvider";
import { priceIn } from "@/lib/price-format";
import { totalsFor } from "@/lib/money";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export default function CartPage() {
  const params = useParams<{ locale: string }>();
  const locale = (isLocale(params.locale) ? params.locale : "en") as Locale;
  const t = translator(locale);

  const currency = useCurrency();
  const money = (amount: number) => priceIn(amount, currency);
  const { items, setQty, remove, discount, setDiscount } = useCart();
  const { subtotal } = totalsFor(items);
  const discountAmount = discount?.amount ?? 0;
  const discounted = Math.max(0, subtotal - discountAmount);
  const { shipping, total } = totalsFor([{ price: discounted, quantity: 1 }]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-4xl font-black uppercase tracking-tight">{t("cart.title")}</h1>
      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-neutral-400">{t("cart.empty")}</p>
          <Link
            href={`/${locale}/shop`}
            className="mt-6 inline-block bg-lime-400 px-8 py-3 text-sm font-black uppercase tracking-widest text-black"
          >
            {t("cart.emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 md:grid-cols-[1fr_280px]">
          <ul className="divide-y divide-white/10">
            {items.map((i) => (
              <li key={itemKey(i)} className="flex gap-4 py-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.image} alt="" className="h-28 w-28 bg-neutral-900 object-cover" />
                <div className="flex flex-1 flex-col">
                  <div className="flex justify-between gap-3">
                    <Link href={`/${locale}/product/${i.slug}`} className="font-bold uppercase">
                      {i.name}
                    </Link>
                    <span className="font-bold">{money(i.price * i.quantity)}</span>
                  </div>
                  <p className="text-xs text-neutral-400">
                    {i.color} / {i.size}
                  </p>
                  <div className="mt-auto flex items-center gap-4 pt-3 text-sm">
                    <div className="flex items-center border border-white/30">
                      <button className="px-3 py-1" onClick={() => setQty(itemKey(i), i.quantity - 1)}>
                        −
                      </button>
                      <span className="w-8 text-center">{i.quantity}</span>
                      <button
                        className="px-3 py-1 disabled:opacity-30"
                        disabled={i.quantity >= i.maxQuantity}
                        onClick={() => setQty(itemKey(i), i.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    {i.quantity >= i.maxQuantity && (
                      <span className="text-[10px] uppercase tracking-widest text-amber-400">
                        {t("cart.max", { count: i.maxQuantity })}
                      </span>
                    )}
                    <button
                      onClick={() => remove(itemKey(i))}
                      className="text-xs uppercase tracking-widest text-neutral-400 hover:text-white"
                    >
                      {t("cart.remove")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <aside className="h-fit border border-white/10 p-5">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">{t("cart.subtotal")}</span>
              <span>{money(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="mt-2 flex justify-between text-sm text-lime-400">
                <span className="flex items-center gap-2">
                  {discount?.code}
                  <button onClick={() => setDiscount(null)} className="text-[10px] text-neutral-500 underline">
                    {t("cart.remove")}
                  </button>
                </span>
                <span>−{money(discountAmount)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-neutral-400">{t("cart.shipping")}</span>
              <span>{shipping === 0 ? t("cart.free") : money(shipping)}</span>
            </div>
            <div className="mt-4 flex justify-between border-t border-white/10 pt-4 font-bold">
              <span>{t("cart.total")}</span>
              <span>{money(total)}</span>
            </div>
            {shipping > 0 && (
              <p className="mt-2 text-xs text-neutral-400">
                {t("cart.addForFreeShipping", { amount: money(15000 - discounted) })}
              </p>
            )}
            <Link
              href={`/${locale}/checkout`}
              className="mt-5 block bg-lime-400 py-3 text-center text-sm font-black uppercase tracking-widest text-black hover:bg-white"
            >
              {t("cart.checkout")}
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
