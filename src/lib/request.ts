import { headers } from "next/headers";

/**
 * Number of trusted reverse proxies in front of the app. The client fully
 * controls the X-Forwarded-For chain, so only the entry TRUSTED_PROXIES hops
 * from the right can be believed; everything left of it is attacker-writable.
 * 0 (default) ignores proxy headers entirely and uses the socket address.
 * Vercel/nginx in front: set TRUST_PROXIES=1.
 */
const TRUST_PROXIES = Number(process.env.TRUST_PROXIES ?? 0);

export function ipFromForwarded(forwarded: string | null): string | null {
  if (TRUST_PROXIES < 1 || !forwarded) return null;
  const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
  const idx = parts.length - TRUST_PROXIES;
  return idx >= 0 ? (parts[idx] ?? null) : null;
}

export async function clientIp() {
  if (TRUST_PROXIES < 1) return "unknown";
  const h = await headers();
  const ip = ipFromForwarded(h.get("x-forwarded-for"));
  return ip ?? h.get("x-real-ip") ?? "unknown";
}

export async function userAgent() {
  const h = await headers();
  return h.get("user-agent")?.slice(0, 250) ?? null;
}

/** Same lookup as clientIp for a plain Request (route handlers, before proxying). */
export function clientIpFrom(request: Request) {
  if (TRUST_PROXIES < 1) return undefined;
  return (
    ipFromForwarded(request.headers.get("x-forwarded-for")) ??
    request.headers.get("x-real-ip") ??
    undefined
  );
}
