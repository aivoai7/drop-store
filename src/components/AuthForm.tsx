"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/customer-actions";
import { translator } from "@/i18n";
import type { Locale } from "@/i18n/config";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-3 text-sm outline-none transition-colors focus:border-lime-400 placeholder:text-neutral-600";

export function AuthForm({
  mode,
  next,
  locale,
}: {
  mode: "signin" | "signup";
  next?: string;
  locale: Locale;
}) {
  const t = translator(locale);
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="locale" value={locale} />
      {mode === "signup" && (
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {t("auth.name")}
          </span>
          <input name="name" required autoComplete="name" className={field} />
        </label>
      )}
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-500">
          {t("auth.email")}
        </span>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-500">
          {t("auth.password")}
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className={field}
        />
      </label>
      {state?.errorKey && (
        <p className="border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-400">
          {t(`error.${state.errorKey}` as never, state.vars)}
        </p>
      )}
      <button
        disabled={pending}
        className="group flex w-full items-center justify-between bg-lime-400 py-3.5 pl-5 pr-4 text-sm font-black uppercase tracking-widest text-black transition-colors hover:bg-white disabled:opacity-60"
      >
        {pending ? t("auth.wait") : mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
        <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
      </button>
    </form>
  );
}
