import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { canManageAdmins } from "@/lib/permissions";
import { getLicense } from "@/lib/license/state";
import { deactivateLicense } from "@/lib/license/actions";
import { LicenseForm } from "@/components/LicenseForm";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: string }> = {
  trial: { label: "免费试用中", tone: "bg-lime-400/15 text-lime-400" },
  trial_expired: { label: "试用已结束", tone: "bg-red-500/15 text-red-400" },
  active: { label: "有效", tone: "bg-lime-400/15 text-lime-400" },
  expired: { label: "已过期", tone: "bg-red-500/15 text-red-400" },
  invalid: { label: "无效", tone: "bg-red-500/15 text-red-400" },
  unreachable: { label: "服务器不可达", tone: "bg-amber-400/15 text-amber-400" },
  unlicensed: { label: "未启用校验", tone: "bg-white/10 text-neutral-400" },
};

export default async function AdminLicensePage({
  searchParams,
}: {
  searchParams: Promise<{ deactivated?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  const { deactivated } = await searchParams;

  const view = await getLicense();
  const tone = STATUS[view.status] ?? STATUS.invalid;

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">授权</h1>
      <p className="mt-1 text-xs text-neutral-500">系统授权状态与激活</p>

      {deactivated && (
        <p className="mt-4 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          已在本机停用授权。前台将在下次校验后锁定。
        </p>
      )}

      {view.trial && (
        <p className={`mt-4 border px-3 py-2 text-xs ${
          view.trial.status === "trial"
            ? "border-lime-500/40 bg-lime-500/10 text-lime-300"
            : "border-red-500/40 bg-red-500/10 text-red-300"
        }`}>
          {view.trial.status === "trial"
            ? `免费试用期：还剩 ${view.trial.daysLeft} 天（${view.trial.endsAt.toLocaleDateString("zh-CN")} 截止）。到期后前台将锁定，输入授权码即可激活。`
            : "试用期已结束，前台已锁定。输入授权码即可恢复访问。"}
        </p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["状态", tone.label],
          ["套餐", view.plan ?? "—"],
          ["绑定域名", view.domain ?? "—"],
          ["到期时间", view.expiresAt ? view.expiresAt.toLocaleDateString("zh-CN") : "长期"],
        ].map(([label, value]) => (
          <div key={label} className="border border-white/10 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
            <p className="mt-2 text-sm font-black">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${tone.tone}`}>
          {tone.label}
        </span>
        <span>最后校验：{view.lastCheckedAt ? view.lastCheckedAt.toLocaleString("zh-CN") : "从未"}</span>
        {view.enforcementEnabled ? (
          <span>校验服务：已启用</span>
        ) : (
          <span className="text-amber-400">未设置 LICENSE_SERVER_URL，当前不校验</span>
        )}
      </div>

      {view.lastError && (
        <p className="mt-3 border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {view.lastError}
        </p>
      )}
      {view.inGrace && (
        <p className="mt-3 border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          授权服务器不可达，处于离线宽限期。超出宽限期后前台将锁定。
        </p>
      )}

      {canManageAdmins(admin.role) ? (
        <>
          <h2 className="mt-10 text-xs font-black uppercase tracking-widest text-neutral-400">
            更换授权码
          </h2>
          <LicenseForm />
          {view.enforcementEnabled && (
            <form action={deactivateLicense} className="mt-4">
              <button className="border border-red-500/40 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500 hover:text-white">
                在本机停用授权
              </button>
            </form>
          )}
        </>
      ) : (
        <p className="mt-8 text-xs text-neutral-500">{at("acc.ownerOnly")}</p>
      )}
    </div>
  );
}
