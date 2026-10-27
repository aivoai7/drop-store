"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./password";
import {
  createAdminSession,
  destroyAdminSession,
  destroyAllAdminSessions,
  getAdminUser,
} from "./auth";
import { rateLimit, formatRetry } from "./rate-limit";
import { clientIp, userAgent } from "./request";
import { recordAudit } from "./audit";
import { canEdit, canManageAdmins, isRole } from "./permissions";
import { ADMIN_BASE, adminPath } from "@/lib/admin-path";

export type AdminAuthState = { error?: string } | undefined;

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function adminSignIn(
  _prev: AdminAuthState,
  formData: FormData,
): Promise<AdminAuthState> {
  const ip = await clientIp();
  const byIp = await rateLimit(`admin-login:ip:${ip}`, 10, 15 * 60);
  if (!byIp.ok) {
    return { error: `Too many attempts. Try again in ${formatRetry(byIp.retryAfterSeconds)}.` };
  }

  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password" };

  const byEmail = await rateLimit(`admin-login:email:${parsed.data.email}`, 5, 15 * 60);
  if (!byEmail.ok) {
    return { error: `Too many attempts. Try again in ${formatRetry(byEmail.retryAfterSeconds)}.` };
  }

  const admin = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  if (!admin || admin.disabled || !(await verifyPassword(parsed.data.password, admin.passwordHash))) {
    await recordAudit({
      actor: null,
      action: "admin.login.failed",
      target: parsed.data.email,
      ip,
    });
    return { error: "Wrong email or password" };
  }

  await createAdminSession({ adminId: admin.id, ip, userAgent: await userAgent() });
  await recordAudit({
    actor: { id: admin.id, email: admin.email },
    action: "admin.login",
    metadata: { role: admin.role },
    ip,
  });
  redirect(ADMIN_BASE);
}

export async function adminSignOut() {
  const admin = await getAdminUser();
  const ip = await clientIp();
  if (admin) await recordAudit({ actor: admin, action: "admin.logout", ip });
  await destroyAdminSession();
  redirect(adminPath("/login"));
}

/** The very first admin is created here so nobody ships a shared default password. */
export async function createFirstAdmin(
  _prev: AdminAuthState,
  formData: FormData,
): Promise<AdminAuthState> {
  const count = await prisma.adminUser.count();
  if (count > 0) return { error: "An admin already exists. Sign in instead." };

  const name = String(formData.get("name") ?? "").trim();
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (parsed.data.password.length < 10) {
    return { error: "Admin passwords must be at least 10 characters" };
  }
  if (name.length < 2) return { error: "Enter your name" };

  const admin = await prisma.adminUser.create({
    data: {
      email: parsed.data.email,
      name,
      role: "owner",
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  const ip = await clientIp();
  await createAdminSession({ adminId: admin.id, ip, userAgent: await userAgent() });
  await recordAudit({
    actor: { id: admin.id, email: admin.email },
    action: "admin.created",
    target: admin.email,
    metadata: { firstAdmin: true, role: "owner" },
    ip,
  });
  redirect(ADMIN_BASE);
}

export async function changeAdminPassword(
  _prev: AdminAuthState,
  formData: FormData,
): Promise<AdminAuthState> {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 10) return { error: "New password must be at least 10 characters" };
  if (next !== confirm) return { error: "Passwords do not match" };

  const row = await prisma.adminUser.findUnique({ where: { id: admin.id } });
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return { error: "Current password is wrong" };
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(next) },
  });
  const ip = await clientIp();
  await destroyAllAdminSessions(admin.id);
  await createAdminSession({ adminId: admin.id, ip, userAgent: await userAgent() });
  await recordAudit({ actor: admin, action: "admin.password.changed", ip });
  redirect(adminPath("/account?updated=1"));
}

export async function addAdminTeamMember(
  _prev: AdminAuthState,
  formData: FormData,
): Promise<AdminAuthState> {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  if (!canManageAdmins(admin.role)) return { error: "Only owners can add team members" };

  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "manager");
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (parsed.data.password.length < 10) {
    return { error: "Admin passwords must be at least 10 characters" };
  }
  if (name.length < 2) return { error: "Enter their name" };
  if (!isRole(role)) return { error: "Pick a valid role" };

  const existing = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "That email is already an admin" };

  const created = await prisma.adminUser.create({
    data: {
      email: parsed.data.email,
      name,
      role,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  await recordAudit({
    actor: admin,
    action: "admin.created",
    target: created.email,
    metadata: { name: created.name, role },
    ip: await clientIp(),
  });
  revalidatePath(adminPath("/account"));
  redirect(adminPath("/account?added=1"));
}

export async function updateTeamMemberRole(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  if (!canManageAdmins(admin.role)) redirect(adminPath("/account?denied=1"));

  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (!isRole(role)) redirect(adminPath("/account"));

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) redirect(adminPath("/account"));

  // Don't allow demoting the last owner — that would lock everyone out.
  if (target.role === "owner" && role !== "owner") {
    const owners = await prisma.adminUser.count({ where: { role: "owner", disabled: false } });
    if (owners <= 1) redirect(adminPath("/account?error=last-owner"));
  }

  await prisma.adminUser.update({ where: { id }, data: { role } });
  await recordAudit({
    actor: admin,
    action: "admin.role.changed",
    target: target.email,
    metadata: { from: target.role, to: role },
    ip: await clientIp(),
  });
  revalidatePath(adminPath("/account"));
  redirect(adminPath("/account?saved=1"));
}

export async function toggleTeamMemberDisabled(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  if (!canManageAdmins(admin.role)) redirect(adminPath("/account?denied=1"));

  const id = String(formData.get("id"));
  if (id === admin.id) redirect(adminPath("/account?error=self"));

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) redirect(adminPath("/account"));

  if (!target.disabled && target.role === "owner") {
    const owners = await prisma.adminUser.count({ where: { role: "owner", disabled: false } });
    if (owners <= 1) redirect(adminPath("/account?error=last-owner"));
  }

  await prisma.adminUser.update({ where: { id }, data: { disabled: !target.disabled } });
  if (!target.disabled) {
    await prisma.adminSession.deleteMany({ where: { adminId: id } });
  }
  await recordAudit({
    actor: admin,
    action: target.disabled ? "admin.enabled" : "admin.disabled",
    target: target.email,
    ip: await clientIp(),
  });
  revalidatePath(adminPath("/account"));
  redirect(adminPath("/account?saved=1"));
}

export async function removeTeamMember(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  if (!canManageAdmins(admin.role)) redirect(adminPath("/account?denied=1"));

  const id = String(formData.get("id"));
  if (id === admin.id) redirect(adminPath("/account?error=self"));

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) redirect(adminPath("/account"));

  if (target.role === "owner") {
    const owners = await prisma.adminUser.count({ where: { role: "owner", disabled: false } });
    if (owners <= 1) redirect(adminPath("/account?error=last-owner"));
  }

  await prisma.adminUser.delete({ where: { id } });
  await recordAudit({
    actor: admin,
    action: "admin.removed",
    target: target.email,
    ip: await clientIp(),
  });
  revalidatePath(adminPath("/account"));
  redirect(adminPath("/account?saved=1"));
}

export async function resetCustomerPassword(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin || !canEdit(admin.role)) redirect(adminPath("/login"));

  const userId = String(formData.get("userId"));
  const password = String(formData.get("password") ?? "");
  const backTo = String(formData.get("backTo") ?? adminPath("/customers"));
  if (password.length < 8) redirect(`${backTo}?error=Password must be at least 8 characters`);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect(backTo);

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await prisma.session.deleteMany({ where: { userId } });
  await recordAudit({
    actor: admin,
    action: "customer.password.reset",
    target: user.email,
    ip: await clientIp(),
  });
  revalidatePath(backTo);
  redirect(`${backTo}?saved=1`);
}

export async function toggleCustomerDisabled(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin || !canEdit(admin.role)) redirect(adminPath("/login"));

  const userId = String(formData.get("userId"));
  const backTo = String(formData.get("backTo") ?? adminPath("/customers"));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect(backTo);

  await prisma.user.update({ where: { id: userId }, data: { disabled: !user.disabled } });
  if (!user.disabled) await prisma.session.deleteMany({ where: { userId } });

  await recordAudit({
    actor: admin,
    action: user.disabled ? "customer.enabled" : "customer.disabled",
    target: user.email,
    ip: await clientIp(),
  });
  revalidatePath(backTo);
  redirect(`${backTo}?saved=1`);
}
