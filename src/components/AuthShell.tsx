import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Split-screen shell for the customer auth pages: brand panel on the left,
 * form on the right. Collapses to a plain centered column on small screens.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  locale,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  locale: string;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-neutral-950 lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- matches the storefront hero convention */}
        <img
          src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <Link href={`/${locale}`} className="text-lg font-black tracking-[0.3em]">
            DROP
          </Link>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.4em] text-lime-400">{eyebrow}</p>
            <p className="mt-3 max-w-sm text-3xl font-black uppercase leading-tight">
              Built loud.<br />Worn louder.
            </p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-black px-4 py-16">
        <div className="w-full max-w-sm">
          <Link href={`/${locale}`} className="text-lg font-black tracking-[0.3em] text-white lg:hidden">
            DROP
          </Link>
          <div className="mt-8 lg:mt-0">
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">{title}</h1>
            <p className="mt-2 text-sm text-neutral-400">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <div className="mt-6 text-xs text-neutral-400">{footer}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
