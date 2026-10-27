import Link from "next/link";
import { getLicense } from "@/lib/license/state";
import { LicenseForm } from "@/components/LicenseForm";
import { LicenseGate } from "@/components/LicenseGate";

export const dynamic = "force-dynamic";

export const metadata = { title: "授权激活 — DROP" };

const STATUS_TEXT: Record<string, string> = {
  trial: "免费试用期",
  trial_expired: "试用期已结束",
  invalid: "授权码无效或已被吊销",
  expired: "授权已过期",
  unreachable: "无法连接授权服务器",
  active: "授权有效",
  unlicensed: "开发模式（未启用授权校验）",
};

export default async function LicensePage({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string; next?: string }>;
}) {
  const { activated, next } = await searchParams;
  const view = await getLicense();

  if (view.ok && activated === "1") {
    return (
      <main className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <div className="w-full max-w-sm text-center">
          <p className="text-xs font-black tracking-[0.4em] text-lime-400">授权成功</p>
          <h1 className="mt-3 text-3xl font-black uppercase">已激活</h1>
          <p className="mt-3 text-sm text-neutral-400">
            域名 {view.domain ?? "—"} · 有效期至{" "}
            {view.expiresAt ? view.expiresAt.toLocaleDateString("zh-CN") : "长期"}
          </p>
          <Link
            href="/"
            className="mt-8 inline-block bg-lime-400 px-8 py-3 text-sm font-black uppercase tracking-widest text-black"
          >
            进入店铺
          </Link>
        </div>
      </main>
    );
  }

  // Licence valid (or trial still open) but the middleware cookie expired:
  // re-issue it and send the visitor back. Rendered as a brief stop-through.
  if (view.ok) {
    return (
      <main className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <div className="w-full max-w-sm text-center">
          <p className="text-xl font-black tracking-[0.25em]">DROP</p>
          <p className="mt-4 text-sm text-neutral-400">授权有效，正在进入店铺…</p>
        </div>
        <LicenseGate next={next} />
      </main>
    );
  }

  const onTrial = view.trial?.status === "trial";
  const endsAt = view.trial?.endsAt ?? view.expiresAt;

  return (
    <main className="grid min-h-screen place-items-center bg-black px-4 text-white">
      <div className="w-full max-w-sm">
        <p className="text-xl font-black tracking-[0.25em]">DROP</p>
        <h1 className="mt-6 text-3xl font-black uppercase tracking-tight">
          {onTrial ? "免费试用中" : "需要授权"}
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          {onTrial
            ? `试用还剩 ${view.trial?.daysLeft} 天，无需授权码即可使用全部功能。`
            : "本系统需要有效授权才能使用。请输入你的授权码。"}
        </p>

        <div className="mt-4 border border-white/10 px-3 py-2 text-xs">
          <span className="text-neutral-500">当前状态：</span>
          <span className={view.ok ? "text-lime-400" : onTrial ? "text-lime-400" : "text-red-400"}>
            {STATUS_TEXT[view.status] ?? view.status}
          </span>
          {endsAt && (
            <span className="mt-1 block text-[11px] text-neutral-500">
              {onTrial ? "试用截止：" : "有效期至："}
              {endsAt.toLocaleDateString("zh-CN")}
            </span>
          )}
          {view.lastError && (
            <span className="mt-1 block text-[11px] text-neutral-500">{view.lastError}</span>
          )}
        </div>

        <LicenseForm />

        {onTrial && (
          <p className="mt-3 text-[11px] text-neutral-500">
            已有授权码？现在激活即可无缝切换，试用剩余时间不作折抵。
          </p>
        )}

        {view.inGrace && (
          <p className="mt-4 text-[11px] text-amber-400">
            授权服务器暂时无法连接，正在离线宽限期内。请尽快恢复网络。
          </p>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-neutral-600">
          授权与域名绑定，更换域名需要重新激活。如果这是你自己的部署且已授权，请检查
          LICENSE_SERVER_URL 配置。
        </p>
      </div>
    </main>
  );
}
