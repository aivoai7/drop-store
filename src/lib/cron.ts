import { prisma } from "./db";
import { pruneRateLimits } from "./rate-limit";

export type CleanupResult = {
  rateLimitEvents: number;
  expiredSessions: number;
  adminSessions: number;
  resetTokens: number;
  oldEmailLogs: number;
};

/**
 * Housekeeping that keeps the tables from growing without bound.
 * Safe to run repeatedly; every delete is scoped to a time window.
 */
export async function runCleanup(now = new Date()): Promise<CleanupResult> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const before = await prisma.rateLimitEvent.count();
  await pruneRateLimits(24 * 60 * 60);
  const after = await prisma.rateLimitEvent.count();

  const [sessions, adminSessions, resetTokens, emailLogs] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: dayAgo } }],
      },
    }),
    prisma.emailMessage.deleteMany({ where: { createdAt: { lt: monthAgo } } }),
  ]);
  void weekAgo;

  return {
    rateLimitEvents: before - after,
    expiredSessions: sessions.count,
    adminSessions: adminSessions.count,
    resetTokens: resetTokens.count,
    oldEmailLogs: emailLogs.count,
  };
}
