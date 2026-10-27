"use client";

import { useActionState, useState } from "react";
import { activateLicense, type LicenseFormState } from "@/lib/license/actions";

export function LicenseForm({ defaultValue = "" }: { defaultValue?: string }) {
  const [state, action, pending] = useActionState<LicenseFormState, FormData>(
    activateLicense,
    undefined,
  );
  const [key, setKey] = useState(defaultValue);

  return (
    <form action={action} className="mt-6 space-y-3">
      <input
        name="key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="DROP-XXXX-XXXX-XXXX-XXXX"
        autoComplete="off"
        spellCheck={false}
        className="w-full border border-white/20 bg-transparent px-3 py-3 font-mono text-sm outline-none focus:border-lime-400"
      />
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button
        disabled={pending || !key.trim()}
        className="w-full bg-lime-400 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-60"
      >
        {pending ? "正在验证…" : "激活"}
      </button>
    </form>
  );
}
