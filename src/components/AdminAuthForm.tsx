"use client";

import { useActionState, useState } from "react";
import { adminSignIn, createFirstAdmin, type AdminAuthState } from "@/lib/admin-actions";
import { at } from "@/lib/admin-copy/zh";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-3 text-sm outline-none transition-colors focus:border-lime-400 placeholder:text-neutral-600";

export function AdminAuthForm({ mode }: { mode: "signin" | "setup" }) {
  const action = mode === "signin" ? adminSignIn : createFirstAdmin;
  const [state, formAction, pending] = useActionState<AdminAuthState, FormData>(action, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="mt-6 space-y-3">
      {mode === "setup" && (
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {at("acc.memberName")}
          </span>
          <input name="name" required autoComplete="name" className={field} />
        </label>
      )}
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-500">
          {at("login.email")}
        </span>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-500">
          {mode === "setup" ? at("acc.tempPassword") : at("login.password")}
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "setup" ? 10 : 1}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          className={field}
        />
      </label>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button
        disabled={pending}
        className="group flex w-full items-center justify-between bg-lime-400 py-3.5 pl-5 pr-4 text-sm font-black uppercase tracking-widest text-black transition-colors hover:bg-white disabled:opacity-60"
      >
        {pending ? at("login.creating") : mode === "setup" ? at("login.setupTitle") : at("login.signIn")}
        <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
      </button>
    </form>
  );
}
