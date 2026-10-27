"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthState } from "@/lib/customer-actions";
import { translator } from "@/i18n";
import type { Locale } from "@/i18n/config";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-lime-400";

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    undefined,
  );

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <input name="email" type="email" required placeholder={t("auth.email")} autoComplete="email" className={field} />
      {state?.errorKey && (
        <p className="text-sm text-red-400">{t(`error.${state.errorKey}` as never, state.vars)}</p>
      )}
      {state?.noticeKey && <p className="text-sm text-lime-400">{t(`error.${state.noticeKey}` as never)}</p>}
      {state?.resetUrl && (
        <p className="border border-white/15 p-3 text-xs text-neutral-300">
          No mail provider is connected in this demo, so here is the link:{" "}
          <Link href={state.resetUrl} className="break-all text-lime-400 underline">
            {state.resetUrl}
          </Link>
        </p>
      )}
      <button
        disabled={pending}
        className="w-full bg-lime-400 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-60"
      >
        {pending ? t("forgot.sending") : t("forgot.send")}
      </button>
    </form>
  );
}
