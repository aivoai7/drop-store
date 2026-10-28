import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";

const SESSION_COOKIE = "drop_session";
const ADMIN_COOKIE = "drop_admin";
const SESSION_DAYS = 30;
const ADMIN_HOURS = 8;

/**
 * True when the deployment serves plain HTTP on a loopback host (local dev or
 * a self-hosted test box). Browsers treat localhost as a secure context, so
 * dropping the Secure flag there is safe; real domains in production keep it.
 */
function isLocalDeployment() {
  const site = (process.env.SITE_URL ?? "").toLowerCase();
  if (/^https:\/\/localhost|^http:\/\/localhost|^http:\/\/127\.0\.0\.1|^http:\/\/\[::1\]/.test(site)) {
    return true;
  }
  // No SITE_URL configured and not on Vercel — assume a self-hosted box.
  return !site && !process.env.VERCEL_URL;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/* ---------- customer sessions ---------- */

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { token: hashToken(token), userId, expiresAt },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !isLocalDeployment(),
    path: "/",
    expires: expiresAt,
  });
}

export type SessionUser = { id: string; email: string; name: string };

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // A disabled customer is signed out everywhere on their next request.
  if (session.user.disabled) {
    await prisma.session.deleteMany({ where: { userId: session.user.id } }).catch(() => {});
    return null;
  }
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

/** Invalidates every session for a user (used after a password reset). */
export async function destroyAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

/* ---------- admin sessions ---------- */

export type AdminSessionUser = { id: string; email: string; name: string; role: string };

export async function createAdminSession(input: {
  adminId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_HOURS * 60 * 60 * 1000);

  await prisma.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      adminId: input.adminId,
      expiresAt,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
  await prisma.adminUser.update({
    where: { id: input.adminId },
    data: { lastLoginAt: new Date() },
  });

  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure cookies never travel over plain HTTP, which would silently drop
    // the session on self-hosted http:// deployments. Browsers exempt
    // localhost from the Secure restriction, but next start does not know the
    // host — so detect it here.
    secure: process.env.NODE_ENV === "production" && !isLocalDeployment(),
    path: "/",
    expires: expiresAt,
  });
}

export async function getAdminUser(): Promise<AdminSessionUser | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // A disabled admin is signed out everywhere on their next request.
  if (session.admin.disabled) {
    await prisma.adminSession.deleteMany({ where: { adminId: session.admin.id } }).catch(() => {});
    return null;
  }
  return {
    id: session.admin.id,
    email: session.admin.email,
    name: session.admin.name,
    role: session.admin.role,
  };
}

export async function isAdmin() {
  return (await getAdminUser()) !== null;
}

export async function destroyAllAdminSessions(adminId: string) {
  await prisma.adminSession.deleteMany({ where: { adminId } });
}

export async function destroyAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) {
    await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(ADMIN_COOKIE);
}

export { SESSION_COOKIE, ADMIN_COOKIE };
