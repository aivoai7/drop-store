import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { canManageAdmins, ROLE_HELP, ROLE_LABELS, ROLES, isRole } from "@/lib/permissions";
import { AdminAccountForms, TeamRowControls } from "@/components/AdminAccountForms";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; added?: string; error?: string; denied?: string; saved?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { updated, added, error, denied, saved } = await searchParams;
  const canManage = canManageAdmins(admin.role);
  const team = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, disabled: true, createdAt: true, lastLoginAt: true },
  });

  const messages: Record<string, string> = {
    "last-owner": at("acc.lastOwner"),
    self: at("acc.self"),
  };

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("acc.title")}</h1>
      <p className="mt-1 text-xs text-neutral-400">
        {admin.name} · {admin.email} ·{" "}
        <span className="text-lime-400">{isRole(admin.role) ? ROLE_LABELS[admin.role] : admin.role}</span>
      </p>

      {updated && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("acc.passwordUpdated")}</p>}
      {added && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("acc.memberAdded")}</p>}
      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("acc.saved")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{messages[error] ?? "该操作不被允许。"}</p>}
      {denied && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{at("acc.ownerOnly")}</p>}

      <h2 className="mt-10 text-xs font-black uppercase tracking-widest text-neutral-400">{at("acc.team")}</h2>
      <ul className="mt-3 divide-y divide-white/10">
        {team.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {member.name}
                {member.id === admin.id && (
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-lime-400">{at("c.you")}</span>
                )}
                {member.disabled && (
                  <span className="ml-2 bg-red-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-red-400">
                    {at("c.disabled")}
                  </span>
                )}
              </p>
              <p className="text-xs text-neutral-500">{member.email}</p>
              <p className="text-[10px] text-neutral-600">
                {member.lastLoginAt ? at("acc.lastSignIn", { date: member.lastLoginAt.toLocaleDateString("zh-CN") }) : at("acc.neverSignedIn")}
              </p>
            </div>
            {canManage && member.id !== admin.id ? (
              <TeamRowControls id={member.id} role={member.role} disabled={member.disabled} />
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {isRole(member.role) ? ROLE_LABELS[member.role] : member.role}
              </span>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xs font-black uppercase tracking-widest text-neutral-400">{at("acc.roles")}</h2>
      <ul className="mt-3 space-y-1 text-xs text-neutral-400">
        {ROLES.map((role) => (
          <li key={role}>
            <span className="font-bold text-white">{ROLE_LABELS[role]}</span> — {ROLE_HELP[role]}
          </li>
        ))}
      </ul>

      <AdminAccountForms canManageTeam={canManage} />
    </div>
  );
}
