"use client";

import { useActionState, useState } from "react";
import { adminSignIn, createFirstAdmin, type AdminAuthState } from "@/lib/admin-actions";
import { at } from "@/lib/admin-copy/zh";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-lime-400";

export function AdminAuthForm({ mode }: { mode: "signin" | "setup" }) {
  const action = mode === "signin" ? adminSignIn : createFirstAdmin;
  const [state, formAction, pending] = useActionState<AdminAuthState, FormData>(action, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="mt-6 space-y-3">
      {mode === "setup" && (
        <input name="name" required placeholder={at("acc.memberName")} autoComplete="name" className={field} />
      )}
      <input
        name="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={at("login.email")}
        autoComplete="username"
        className={field}
      />
      <input
        name="password"
        type="password"
        required
        minLength={mode === "setup" ? 10 : 1}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === "setup" ? at("acc.tempPassword") : at("login.password")}
        autoComplete={mode === "setup" ? "new-password" : "current-password"}
        className={field}
      />
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full bg-lime-400 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-60"
      >
        {pending ? at("login.creating") : mode === "setup" ? at("login.setupTitle") : at("login.signIn")}
      </button>
    </form>
  );
}
