"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, destroyAllSessions } from "./auth";
import { rateLimit, formatRetry } from "./rate-limit";
import { clientIp } from "./request";
import {
  issueResetToken,
  findValidResetToken,
  consumeResetToken,
} from "./password-reset";
import { sendEmail } from "./email";
import { passwordResetEmail, welcomeEmail } from "./email-templates";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("invalidEmail"),
  password: z.string().min(8, "passwordTooShort"),
});

export type AuthState = { errorKey?: string; noticeKey?: string; resetUrl?: string; vars?: Record<string, string | number> } | undefined;

function safeNext(value: FormDataEntryValue | null, formData: FormData) {
  const next = String(value ?? "");
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  const locale = String(formData.get("locale") ?? "en");
  return `/${locale}/account`;
}

/* ---------- sign up ---------- */

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ip = await clientIp();
  const limit = await rateLimit(`signup:${ip}`, 5, 15 * 60);
  if (!limit.ok) {
    return { errorKey: "tooManyAttempts", vars: { time: formatRetry(limit.retryAfterSeconds) } };
  }

  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { errorKey: parsed.error.issues[0]?.message ?? "invalidEmail" };
  }
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { errorKey: "nameRequired" };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { errorKey: "accountExists" };

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  const welcome = welcomeEmail({ name: user.name });
  await sendEmail({ to: user.email, ...welcome, template: "welcome" });

  await createSession(user.id);
  redirect(safeNext(formData.get("next"), formData));
}

/* ---------- sign in ---------- */

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = await clientIp();

  // Two buckets: per-account (defeats a distributed attack on one user) and
  // per-IP (defeats spraying many accounts from one host).
  const byIp = await rateLimit(`login:ip:${ip}`, 20, 15 * 60);
  if (!byIp.ok) {
    return { errorKey: "tooManyAttempts", vars: { time: formatRetry(byIp.retryAfterSeconds) } };
  }
  if (email) {
    const byAccount = await rateLimit(`login:email:${email}`, 5, 15 * 60);
    if (!byAccount.ok) {
      return { errorKey: "tooManyAttempts", vars: { time: formatRetry(byAccount.retryAfterSeconds) } };
    }
  }

  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { errorKey: "emailRequired" };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { errorKey: "wrongCredentials" };
  }
  if (user.disabled) {
    return { errorKey: "accountDisabled" };
  }

  await createSession(user.id);
  redirect(safeNext(formData.get("next"), formData));
}

export async function signOut() {
  await destroySession();
  redirect("/");
}

/* ---------- forgot / reset password ---------- */

const emailOnly = z.string().trim().toLowerCase().email("Enter a valid email");

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const ip = await clientIp();
  const byIp = await rateLimit(`reset:ip:${ip}`, 5, 15 * 60);
  if (!byIp.ok) {
    return { errorKey: "tooManyAttempts", vars: { time: formatRetry(byIp.retryAfterSeconds) } };
  }

  const parsed = emailOnly.safeParse(formData.get("email"));
  if (!parsed.success) return { errorKey: "invalidEmail" };

  const byEmail = await rateLimit(`reset:email:${parsed.data}`, 3, 15 * 60);
  if (!byEmail.ok) {
    // Same wording as success so the endpoint can't be used to enumerate accounts.
    return { noticeKey: "resetSent" };
  }

  const issued = await issueResetToken(parsed.data);

  // Always the same message: never reveal whether an account exists.
  if (!issued) return { noticeKey: "resetSent" };

  const mail = passwordResetEmail({ name: issued.user.name, token: issued.token });
  const result = await sendEmail({
    to: issued.user.email,
    ...mail,
    template: "password-reset",
  });

  // Without a mail provider nobody could ever finish the flow, so fall back to
  // showing the link locally. Never do this in production.
  if (!result.ok && process.env.NODE_ENV !== "production") {
    return { noticeKey: "resetSent", resetUrl: `/reset-password?token=${issued.token}` };
  }
  return { noticeKey: "resetSent" };
}

export async function resetPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ip = await clientIp();
  const limit = await rateLimit(`reset-submit:${ip}`, 10, 15 * 60);
  if (!limit.ok) {
    return { errorKey: "tooManyAttempts", vars: { time: formatRetry(limit.retryAfterSeconds) } };
  }

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { errorKey: "passwordTooShort" };
  if (password !== confirm) return { errorKey: "passwordMismatch" };

  const record = await findValidResetToken(token);
  if (!record) {
    return { errorKey: "resetInvalid" };
  }

  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(password) },
  });
  await consumeResetToken(record.id);
  await destroyAllSessions(record.userId);
  await createSession(record.userId);
  redirect(`/${String(formData.get("locale") ?? "en")}/account`);
}
