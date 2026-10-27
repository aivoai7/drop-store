"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Server components can't set cookies, so the middleware handshake runs in the
 * browser: /api/license/status re-validates server-side, sets the short-lived
 * cookie, and this sends the visitor back to where they were headed. On a
 * locked-out site every redirect lands here, so no visible state is needed —
 * it either bounces through or the page stays on the form.
 */
export function LicenseGate({ next }: { next?: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/license/status", { cache: "no-store" });
        const body = (await res.json()) as { ok?: boolean };
        if (!cancelled && body.ok) {
          router.replace(next && next.startsWith("/") ? next : "/");
          return;
        }
      } catch {
        /* stay on the form */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  return null;
}
