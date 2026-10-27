"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import type { SessionUser } from "@/lib/auth";
import { translator } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { CurrencySwitcher, type CurrencyOption } from "@/components/CurrencySwitcher";

export function Header({
  user,
  locale,
  currency,
  currencies,
}: {
  user: SessionUser | null;
  locale: Locale;
  currency: string;
  currencies: CurrencyOption[];
}) {
  const t = translator(locale);
  const count = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const links = [
    { href: `/${locale}/shop`, label: t("nav.shop") },
    { href: `/${locale}/shop?category=sneakers`, label: t("nav.sneakers") },
    { href: `/${locale}/shop?category=bags`, label: t("nav.bags") },
    { href: `/${locale}/shop?category=apparel`, label: t("nav.apparel") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link href={`/${locale}`} className="text-xl font-black tracking-[0.25em]">
            DROP
          </Link>
        </div>

        <nav className="hidden items-center gap-7 text-xs font-bold uppercase tracking-[0.2em] md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-lime-400">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <form action={`/${locale}/shop`} className="hidden items-center gap-2 border-b border-white/30 sm:flex">
            <Search size={14} className="text-neutral-400" />
            <input
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("nav.search")}
              className="w-24 bg-transparent py-1 text-sm outline-none placeholder:text-neutral-500"
            />
          </form>
          <div className="hidden items-center gap-3 sm:flex">
            <LocaleSwitcher current={locale} />
            <CurrencySwitcher current={currency} options={currencies} />
          </div>
          <Link
            href={user ? `/${locale}/account` : `/${locale}/login`}
            className="hidden text-xs font-bold uppercase tracking-widest hover:text-lime-400 sm:block"
          >
            {user ? user.name.split(" ")[0] : t("nav.signIn")}
          </Link>
          <Link href={`/${locale}/cart`} className="relative" aria-label={t("nav.cart")}>
            <ShoppingBag size={20} />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center bg-lime-400 text-[10px] font-black text-black">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-4 border-t border-white/10 px-4 py-4 text-sm font-bold uppercase tracking-widest md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <form action={`/${locale}/shop`} className="flex items-center gap-2 border-b border-white/30 py-2">
            <Search size={14} className="text-neutral-400" />
            <input
              name="q"
              placeholder={t("nav.search")}
              className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-neutral-500"
            />
          </form>
          <LocaleSwitcher current={locale} />
          <CurrencySwitcher current={currency} options={currencies} />
          <Link href={user ? `/${locale}/account` : `/${locale}/login`} onClick={() => setOpen(false)}>
            {user ? t("nav.account") : t("nav.signIn")}
          </Link>
        </nav>
      )}
    </header>
  );
}
