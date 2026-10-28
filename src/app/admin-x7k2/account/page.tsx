import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { canManageAdmins, ROLES, isRole } from "@/lib/permissions";
import { ROLE_HELP_ZH, ROLE_LABELS_ZH } from "@/lib/admin-copy/roles";
import { AddMemberForm, ChangePasswordForm, TeamRowControls } from "@/components/AdminAccountForms";
import { at } from "@/lib/admin-copy/zh";
import { adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

const roleTone: Record<string, string> = {
  owner: "bg-lime-400/15 text-lime-400",
  manager: "bg-sky-400/10 text-sky-300",
  viewer: "bg-white/10 text-neutral-400",
};

const messageTone: Record<string, string> = {
  error: "border-red-500/40 bg-red-500/10 text-red-300",
  ok: "border-lime-400/40 bg-lime-400/10 text-lime-300",
};

export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; added?: string; error?: string; denied?: string; saved?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));

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

  const banner = [
    updated && { tone: "ok", text: at("acc.passwordUpdated") },
    added && { tone: "ok", text: at("acc.memberAdded") },
    saved && { tone: "ok", text: at("acc.saved") },
    error && { tone: "error", text: messages[error] ?? "该操作不被允许。" },
    denied && { tone: "error", text: at("acc.ownerOnly") },
  ].filter(Boolean) as Array<{ tone: string; text: string }>;

  return (
    <div>
      {/* Header: identity */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("acc.title")}</h1>
          <p className="mt-1 text-xs text-neutral-500">{at("acc.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 border border-white/10 bg-neutral-950 px-4 py-3">
          <span className="grid h-9 w-9 place-items-center bg-lime-400 text-sm font-black text-black">
            {admin.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-bold leading-tight">{admin.name}</p>
            <p className="text-[11px] text-neutral-500">{admin.email}</p>
          </div>
          <span className={`ml-2 px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${roleTone[admin.role] ?? "bg-white/10"}`}>
            {isRole(admin.role) ? ROLE_LABELS_ZH[admin.role] : admin.role}
          </span>
        </div>
      </div>

      {/* Banners */}
      <div className="mt-5 space-y-2">
        {banner.map((b, i) => (
          <p key={i} className={`border px-3 py-2 text-xs ${messageTone[b.tone]}`}>{b.text}</p>
        ))}
      </div>

      {/* Team */}
      <div className="mt-8 border border-white/10 bg-neutral-950">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-300">{at("acc.team")}</h2>
            <p className="mt-0.5 text-[11px] text-neutral-600">
              {team.length} 名成员 · {team.filter((m) => !m.disabled).length} 名启用中
            </p>
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-widest text-neutral-600">
            <tr>
              <th className="px-5 py-3 font-bold">{at("acc.memberName")}</th>
              <th className="px-5 py-3 font-bold">邮箱</th>
              <th className="px-5 py-3 font-bold">{at("acc.role")}</th>
              <th className="px-5 py-3 font-bold">{at("acc.neverSignedIn").slice(0, 4)}</th>
              <th className="px-5 py-3 text-right font-bold">{canManage ? "操作" : ""}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {team.map((member) => {
              const isSelf = member.id === admin.id;
              const roleLabel = isRole(member.role) ? ROLE_LABELS_ZH[member.role] : member.role;
              return (
                <tr key={member.id} className={member.disabled ? "opacity-50" : ""}>
                  <td className="px-5 py-3.5">
                    <p className="font-bold">
                      {member.name}
                      {isSelf && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-lime-400">{at("c.you")}</span>
                      )}
                      {member.disabled && (
                        <span className="ml-2 bg-red-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-red-400">
                          {at("c.disabled")}
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-neutral-400">{member.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${roleTone[member.role] ?? "bg-white/10"}`}>
                      {roleLabel}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-neutral-500">
                    {member.lastLoginAt ? member.lastLoginAt.toLocaleDateString("zh-CN") : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {canManage && !isSelf ? (
                      <TeamRowControls id={member.id} role={member.role} disabled={member.disabled} />
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest text-neutral-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Password + add member, two columns */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="border border-white/10 bg-neutral-950 p-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-300">{at("acc.changePassword")}</h2>
          <p className="mt-1 text-[11px] text-neutral-600">更新后其他所有会话将自动登出。</p>
          <div className="mt-4"><ChangePasswordForm /></div>
        </div>

        {canManage ? (
          <div className="border border-white/10 bg-neutral-950 p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-300">{at("acc.addMember")}</h2>
            <p className="mt-1 text-[11px] text-neutral-600">新成员首次登录后建议立即修改临时密码。</p>
            <div className="mt-4"><AddMemberForm /></div>
          </div>
        ) : (
          <div className="border border-white/10 bg-neutral-950 p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-300">{at("acc.roles")}</h2>
            <ul className="mt-4 space-y-3 text-xs">
              {ROLES.map((role) => (
                <li key={role} className="flex items-start gap-3">
                  <span className={`mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${roleTone[role]}`}>
                    {ROLE_LABELS_ZH[role]}
                  </span>
                  <span className="text-neutral-400">{ROLE_HELP_ZH[role]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

