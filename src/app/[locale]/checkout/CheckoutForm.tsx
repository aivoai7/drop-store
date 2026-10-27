"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { useCurrency } from "@/components/CurrencyProvider";
import { priceIn } from "@/lib/price-format";
import { COUNTRIES } from "@/lib/countries";
import { translator } from "@/i18n";
import type { Locale } from "@/i18n/config";

type Customer = { id: string; email: string; name: string } | null;

type Quote = {
  lines: Array<{ variantId: string; unit: string }>;
  currency: { code: string; symbol: string; decimals: number };
  currencies: Array<{ code: string; name: string; symbol: string; rate: number; decimals: number }>;
  paymentMethods: Array<{ code: string; name: string; description: string | null; instructions: string | null; automated: boolean }>;
  shippingOptions: Array<{ id: string; name: string; description: string | null; display: string }>;
  shippingMethodId: string;
  tax: { enabled: boolean; rate: number; label: string | null; display: string };
  discount: { code: string; display: string } | null;
  amounts: { subtotal: string; shipping: string; tax: string; total: string };
};

export function CheckoutForm({ user, locale }: { user: Customer; locale: Locale }) {
  const t = translator(locale);
  const displayCurrency = useCurrency();
  const money = (amount: number) => priceIn(amount, displayCurrency);
  const { items, discount, setDiscount, clear } = useCart();
  const router = useRouter();

  const [country, setCountry] = useState("US");
  const [region, setRegion] = useState("");
  const [currency, setCurrency] = useState(displayCurrency.code);
  const [shippingId, setShippingId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const [code, setCode] = useState(discount?.code ?? "");
  const [discountError, setDiscountError] = useState("");

  const cartKey = useMemo(
    () => JSON.stringify(items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity }))),
    [items],
  );

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => !cancelled && setLoading(true));
    fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        country,
        region: region || null,
        currency,
        shippingMethodId: shippingId,
        discountCode: discount?.code ?? null,
        items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
      }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Could not price your order");
          setQuote(null);
          return;
        }
        setError("");
        setQuote(json);
        if (!shippingId) setShippingId(json.shippingMethodId);
        if (json.paymentMethods.length && !json.paymentMethods.some((m: { code: string }) => m.code === paymentMethod)) {
          setPaymentMethod(json.paymentMethods[0].code);
        }
      })
      .catch((err) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError("Could not price your order");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, country, region, currency, shippingId, discount?.code]);

  async function applyCode(e: React.FormEvent) {
    e.preventDefault();
    setDiscountError("");
    if (!code.trim()) return;
    // Validate through the same quote endpoint so the price shown is final.
    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country,
        region: region || null,
        currency,
        shippingMethodId: shippingId,
        discountCode: code,
        items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setDiscount(null);
      setDiscountError(json.error ?? "That code isn't valid");
      return;
    }
    setDiscount({ code: json.discount.code, amount: json.raw?.discountAmount ?? 0, display: json.discount.display });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        name: data.get("name"),
        address: data.get("address"),
        city: data.get("city"),
        region: region || null,
        country,
        currency,
        shippingMethodId: shippingId,
        paymentMethod,
        discountCode: discount?.code ?? null,
        items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not place the order. Please try again.");
      return;
    }
    const json = await res.json();
    clear();
    if (json.redirectUrl?.startsWith("http")) {
      window.location.href = json.redirectUrl;
      return;
    }
    router.push(json.redirectUrl ?? `/${locale}/checkout/success?order=${json.orderId}`);
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-neutral-400">Nothing to check out.</p>
        <Link href="/shop" className="mt-4 inline-block text-lime-400">
          Back to shop
        </Link>
      </div>
    );
  }

  const field = "w-full border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-lime-400";
  const selected = quote?.paymentMethods.find((m) => m.code === paymentMethod);

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-[1fr_340px]">
      <form onSubmit={onSubmit} className="space-y-4">
        <h1 className="text-4xl font-black uppercase tracking-tight">Checkout</h1>
        {user ? (
          <p className="text-xs text-neutral-400">{t("checkout.signedInAs", { email: user.email })}</p>
        ) : (
          <p className="border border-white/10 px-4 py-3 text-xs text-neutral-300">
            {t("checkout.guest")}{" "}
            <Link href={`/${locale}/login?next=/${locale}/checkout`} className="text-lime-400">
              {t("checkout.signInPrompt")}
            </Link>{" "}
            {t("checkout.signInSuffix")}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
            {(quote?.currencies ?? [{ code: "usd", name: "US Dollar", symbol: "$", rate: 1, decimals: 2 }]).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code.toUpperCase()} — {c.name}
              </option>
            ))}
          </select>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={field}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <input name="email" type="email" required placeholder={t("checkout.email")} defaultValue={user?.email ?? ""} className={field} />
        <input name="name" required placeholder={t("checkout.name")} defaultValue={user?.name ?? ""} className={field} />
        <input name="address" required placeholder={t("checkout.address")} className={field} />
        <div className="grid grid-cols-2 gap-4">
          <input name="city" required placeholder={t("checkout.city")} className={field} />
          <input
            name="region"
            value={region}
            onChange={(e) => setRegion(e.target.value.toUpperCase())}
            placeholder={t("checkout.regionPlaceholder")}
            className={field}
          />
        </div>

        {quote && quote.shippingOptions.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">{t("checkout.shippingSection")}</p>
            <div className="space-y-2">
              {quote.shippingOptions.map((o) => (
                <label
                  key={o.id}
                  className={`flex cursor-pointer items-center justify-between border px-3 py-2 text-sm ${
                    shippingId === o.id ? "border-lime-400 bg-lime-400/5" : "border-white/20"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shipping"
                      value={o.id}
                      checked={shippingId === o.id}
                      onChange={() => setShippingId(o.id)}
                      className="accent-lime-400"
                    />
                    <span>
                      {o.name}
                      {o.description && <span className="block text-[11px] text-neutral-500">{o.description}</span>}
                    </span>
                  </span>
                  <span className="font-bold">{o.display}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {quote && quote.paymentMethods.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">{t("checkout.paymentSection")}</p>
            <div className="space-y-2">
              {quote.paymentMethods.map((m) => (
                <label
                  key={m.code}
                  className={`flex cursor-pointer items-center justify-between border px-3 py-2 text-sm ${
                    paymentMethod === m.code ? "border-lime-400 bg-lime-400/5" : "border-white/20"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="payment"
                      value={m.code}
                      checked={paymentMethod === m.code}
                      onChange={() => setPaymentMethod(m.code)}
                      className="accent-lime-400"
                    />
                    <span>
                      {m.name}
                      {m.description && <span className="block text-[11px] text-neutral-500">{m.description}</span>}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {selected?.instructions && (
              <p className="mt-2 border border-white/10 px-3 py-2 text-[11px] text-neutral-400">
                {selected.instructions}
              </p>
            )}
          </div>
        )}

        {paymentMethod === "card" && (
          <input required placeholder={t("checkout.cardNumber")} defaultValue="4242 4242 4242 4242" className={field} />
        )}

        {error && <p className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button
          disabled={pending || loading || !quote}
          className="w-full bg-lime-400 py-4 text-sm font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-60"
        >
          {pending
            ? t("checkout.placing")
            : quote
              ? t("checkout.pay", { amount: quote.amounts.total })
              : t("checkout.calculating")}
        </button>
        <p className="text-[10px] text-neutral-600">{t("checkout.demoNote")}</p>
      </form>

      <aside className="h-fit space-y-4">
        <div className="border border-white/10 p-5">
          <ul className="space-y-3 text-sm">
            {items.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-3">
                <span>
                  {i.name} <span className="text-neutral-500">×{i.quantity}</span>
                  <span className="block text-xs text-neutral-500">
                    {i.color} / {i.size}
                  </span>
                </span>
                <span>{quote?.lines.find((l) => l.variantId === i.variantId)?.unit ?? money(i.price)}</span>
              </li>
            ))}
          </ul>

          <form onSubmit={applyCode} className="mt-4 flex gap-2 border-t border-white/10 pt-4">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("checkout.discountCode")}
              className="flex-1 border border-white/20 bg-transparent px-2 py-2 text-xs uppercase outline-none focus:border-lime-400"
            />
            <button className="border border-white/30 px-3 py-2 text-[10px] font-bold uppercase tracking-widest">
              {t("checkout.apply")}
            </button>
          </form>
          {discountError && <p className="mt-2 text-[11px] text-red-400">{discountError}</p>}

          {quote && (
            <div className="mt-4 space-y-1 border-t border-white/10 pt-4 text-sm">
              <div className="flex justify-between text-neutral-400">
                <span>{t("cart.subtotal")}</span>
                <span>{quote.amounts.subtotal}</span>
              </div>
              {quote.discount && (
                <div className="flex justify-between text-lime-400">
                  <span>{quote.discount.code}</span>
                  <span>−{quote.discount.display}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-400">
                <span>{t("cart.shipping")}</span>
                <span>{quote.amounts.shipping}</span>
              </div>
              {quote.tax.enabled && Number(quote.tax.rate) > 0 && (
                <div className="flex justify-between text-neutral-400">
                  <span>
                    {quote.tax.label ?? "Tax"} ({(quote.tax.rate / 100).toFixed(2).replace(/\.?0+$/, "")}%)
                  </span>
                  <span>{quote.amounts.tax}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 font-bold">
                <span>{t("cart.total")}</span>
                <span>{quote.amounts.total}</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
