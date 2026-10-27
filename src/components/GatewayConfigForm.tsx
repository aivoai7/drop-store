"use client";

import { useActionState, useState } from "react";
import { saveGatewayKeys, removeGatewayKeys, type GatewayFormState } from "@/lib/integration-actions";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-400";

/**
 * Per-gateway credential form. Collapsed to a single button until opened, so
 * the integrations page stays a compact status list.
 */
export function GatewayConfigForm({
  gateway,
  label,
  managed,
  canEncrypt,
}: {
  gateway: "stripe" | "paypal";
  label: string;
  managed: boolean;
  canEncrypt: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<GatewayFormState, FormData>(saveGatewayKeys, undefined);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="border border-white/20 px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:border-lime-400 hover:text-lime-400"
      >
        配置
      </button>
    );
  }

  return (
    <form action={action} className="w-full space-y-3 border border-white/15 p-4 text-left">
      <input type="hidden" name="gateway" value={gateway} />
      <p className="text-xs font-bold uppercase tracking-widest">
        {label} — {managed ? "更新后台配置" : "保存到数据库"}
      </p>

      {!canEncrypt && (
        <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
          未设置 GATEWAY_ENC_KEY 或 APP_SECRET，无法加密保存。请先在环境变量中配置其一。
        </p>
      )}

      {gateway === "stripe" ? (
        <>
          <label className="block text-[11px] text-neutral-400">
            Stripe Secret Key
            <input name="secretKey" required placeholder="sk_live_… / sk_test_…" autoComplete="off" spellCheck={false} className={`mt-1 font-mono ${field}`} />
          </label>
          <label className="block text-[11px] text-neutral-400">
            Webhook Secret（whsec_…，可选）
            <input name="webhookSecret" placeholder="whsec_…" autoComplete="off" spellCheck={false} className={`mt-1 font-mono ${field}`} />
          </label>
        </>
      ) : (
        <>
          <label className="block text-[11px] text-neutral-400">
            Client ID
            <input name="clientId" required autoComplete="off" spellCheck={false} className={`mt-1 font-mono ${field}`} />
          </label>
          <label className="block text-[11px] text-neutral-400">
            Client Secret
            <input name="clientSecret" required type="password" autoComplete="off" spellCheck={false} className={`mt-1 font-mono ${field}`} />
          </label>
          <label className="block text-[11px] text-neutral-400">
            Webhook ID（可选）
            <input name="webhookId" autoComplete="off" spellCheck={false} className={`mt-1 font-mono ${field}`} />
          </label>
        </>
      )}

      {state?.error && <p className="text-[11px] text-red-400">{state.error}</p>}

      <p className="text-[10px] leading-relaxed text-neutral-600">
        密钥加密存储在数据库中，保存后立即生效，无需重启。留空的可选项保持原值。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending || !canEncrypt}
          className="bg-lime-400 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-60"
        >
          {pending ? "保存中…" : "保存密钥"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white">
          取消
        </button>
        {managed && (
          <button
            formAction={removeGatewayKeys}
            className="ml-auto border border-red-500/40 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500 hover:text-white"
          >
            移除
          </button>
        )}
      </div>
    </form>
  );
}
