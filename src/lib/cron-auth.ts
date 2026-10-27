import { timingSafeEqual } from "node:crypto";

/** Cron endpoints are protected by a shared secret header or query token. */
export function verifyCronSecret(given: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
