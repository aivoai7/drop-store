"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { locales, localeMeta, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";

/** Swaps the locale segment in place so the visitor stays on the same page. */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (!isLocale(next) || next === current) return;
    const segments = pathname.split("/");
    segments[1] = next;
    const query = searchParams.toString();
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.push(`${segments.join("/")}${query ? `?${query}` : ""}`));
  }

  return (
    <label className="flex items-center gap-2 text-xs">
      <Globe size={14} className="text-neutral-400" />
      <span className="sr-only">Language</span>
      <select
        value={current}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        className="cursor-pointer bg-transparent text-xs uppercase tracking-widest outline-none disabled:opacity-50"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc} className="bg-black text-white">
            {localeMeta[loc].native}
          </option>
        ))}
      </select>
    </label>
  );
}
