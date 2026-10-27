import { prisma } from "./db";

export type LimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Sliding-window limiter backed by Postgres rows.
 *
 * Every attempt inserts a row; anything older than the window is ignored, so
 * the limit is a true sliding window rather than a fixed bucket. Cheap enough
 * for a single small app and it needs no extra infrastructure (Redis/Upstash).
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<LimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  const hits = await prisma.rateLimitEvent.findMany({
    where: { bucket, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (hits.length >= limit) {
    const oldest = hits[0].createdAt;
    const retryAt = new Date(oldest.getTime() + windowSeconds * 1000);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000)),
    };
  }

  await prisma.rateLimitEvent.create({ data: { bucket, createdAt: now } });
  return { ok: true, remaining: limit - hits.length - 1, retryAfterSeconds: 0 };
}

export async function clearBucket(bucket: string) {
  await prisma.rateLimitEvent.deleteMany({ where: { bucket } });
}

/** Drops expired rows; called opportunistically so the table stays small. */
export async function pruneRateLimits(olderThanSeconds = 24 * 60 * 60) {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  await prisma.rateLimitEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

export function formatRetry(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}
