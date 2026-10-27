"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/customer-actions";
import { translator } from "@/i18n";
import type { Locale } from "@/i18n/config";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-lime-400";

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
    <form action={formAction} className="mt-6 space-y-3">
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="locale" value={locale} />
      {mode === "signup" && (
        <input name="name" required placeholder={t("auth.name")} autoComplete="name" className={field} />
      )}
      <input
        name="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("auth.email")}
        autoComplete="email"
        className={field}
      />
      <input
        name="password"
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("auth.password")}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        className={field}
      />
      {state?.errorKey && (
        <p className="text-sm text-red-400">
          {t(`error.${state.errorKey}` as never, state.vars)}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full bg-lime-400 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-60"
      >
        {pending ? t("auth.wait") : mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
      </button>
    </form>
  );
}
