"use client";

import { useActionState, useState } from "react";
import { resetPassword, type AuthState } from "@/lib/customer-actions";
import { translator } from "@/i18n";
import type { Locale } from "@/i18n/config";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-lime-400";

export function ResetPasswordForm({ token, locale }: { token: string; locale: Locale }) {
  const t = translator(locale);
  const [state, formAction, pending] = useActionState<AuthState, FormData>(resetPassword, undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      <input
        name="password"
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("auth.newPassword")}
        autoComplete="new-password"
        className={field}
      />
      <input
        name="confirm"
        type="password"
        required
        minLength={8}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={t("auth.confirmPassword")}
        autoComplete="new-password"
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
        {pending ? t("auth.saving") : t("reset.set")}
      </button>
    </form>
  );
}
