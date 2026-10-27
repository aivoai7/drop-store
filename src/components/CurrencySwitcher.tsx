"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CURRENCY_COOKIE } from "@/lib/price-format";

export type CurrencyOption = { code: string; name: string; symbol: string };

export function CurrencySwitcher({
  current,
  options,
}: {
  current: string;
  options: CurrencyOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (next === current) return;
    document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="sr-only">Currency</span>
      <select
        value={current}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        className="cursor-pointer bg-transparent text-xs uppercase tracking-widest outline-none disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.code} value={o.code} className="bg-black text-white">
            {o.code.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
