import { headers } from "next/headers";

/** Best-effort client IP from proxy headers, falling back to a shared bucket. */
export async function clientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function userAgent() {
  const h = await headers();
  return h.get("user-agent")?.slice(0, 250) ?? null;
}
