"use client";

import { useEffect, useState } from "react";

/**
 * Self-serve licence purchase, for deployments whose licence server has
 * Stripe checkout enabled (STRIPE_SECRET_KEY + STRIPE_PRICE config there).
 * Opens the hosted payment page in a new tab, then polls the licence server
 * for the issued key; on success the key is activated through the normal
 * server action, so the visitor lands back on a working store.
 */
export function LicensePurchase({ priceDisplay }: { priceDisplay: string }) {
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!purchasing) return;
    let cancelled = false;
    let sessionId: string | null = null;

    const timer = setInterval(async () => {
      try {
        const url = sessionId
          ? `/api/license/purchase?session=${encodeURIComponent(sessionId)}`
          : null;
        if (!url) return;
        const res = await fetch(url, { cache: "no-store" });
        const body = (await res.json()) as { status?: string; key?: string; error?: string };
        if (cancelled) return;
        if (body.status === "completed" && body.key) {
          clearInterval(timer);
          // Activate through the server action by submitting the form.
          const form = document.createElement("form");
          form.method = "POST";
          form.style.display = "none";
          const input = document.createElement("input");
          input.name = "key";
          input.value = body.key;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
        }
      } catch {
        /* keep polling */
      }
    }, 3000);

    (async () => {
      try {
        const res = await fetch("/api/license/purchase", { method: "POST" });
        const body = (await res.json()) as { url?: string; sessionId?: string; error?: string };
        if (cancelled) return;
        if (body.url && body.sessionId) {
          sessionId = body.sessionId;
          window.open(body.url, "_blank");
        } else {
          setError(body.error ?? "无法发起支付");
          setPurchasing(false);
        }
      } catch {
        if (!cancelled) {
          setError("无法连接授权服务器");
          setPurchasing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [purchasing]);

  return (
    <div>
      <button
        onClick={() => setPurchasing(true)}
        disabled={purchasing}
        className="w-full border border-lime-400/60 py-3 text-sm font-black uppercase tracking-widest text-lime-400 hover:bg-lime-400 hover:text-black disabled:opacity-60"
      >
        {purchasing ? "等待支付完成…（在新窗口支付）" : `购买授权 — ${priceDisplay}`}
      </button>
      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      {purchasing && !error && (
        <p className="mt-2 text-[11px] text-neutral-500">
          支付完成后本页会自动激活授权；若窗口被拦截，请允许弹窗后重试。
        </p>
      )}
    </div>
  );
}
