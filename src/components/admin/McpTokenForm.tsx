"use client";

import { useActionState, useState } from "react";
import { createMcpToken, type McpTokenState } from "@/lib/mcp-actions";
import { at } from "@/lib/admin-copy/zh";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-400";

export function McpTokenForm() {
  const [state, formAction, pending] = useActionState<McpTokenState, FormData>(createMcpToken, undefined);
  const [name, setName] = useState("");

  return (
    <section className="mt-8 border border-white/10 p-4">
      <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("mcp.createToken")}</h2>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            {at("mcp.label")}
          </label>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={at("mcp.labelPlaceholder")}
            required
            className={field}
          />
        </div>
        <button
          disabled={pending}
          className="bg-lime-400 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-60"
        >
          {pending ? at("c.creating") : at("mcp.createToken")}
        </button>
      </form>
      {state?.error && <p className="mt-2 text-sm text-red-400">{state.error}</p>}
      {state?.token && <TokenBox token={state.token} prefix={state.prefix ?? ""} />}
    </section>
  );
}

function TokenBox({ token, prefix }: { token: string; prefix: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4 border border-lime-400/40 bg-lime-400/5 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-lime-400">
        {at("mcp.copyNow")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all bg-black px-2 py-2 font-mono text-[11px] text-lime-300">
          {token}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
          className="border border-lime-400/50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-lime-300"
        >
          {copied ? at("c.copied") : at("c.copy")}
        </button>
      </div>
      <p className="mt-2 text-[10px] text-neutral-500">
        {at("mcp.prefixHint", { prefix })}
      </p>
    </div>
  );
}

/** Keeps a freshly created token visible if the list re-renders. */
export function TokenReveal() {
  return null;
}
