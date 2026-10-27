import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { AdminAuthForm } from "@/components/AdminAuthForm";
import { at } from "@/lib/admin-copy/zh";
import { ADMIN_BASE } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden bg-neutral-950 lg:block">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(#bef264 1px, transparent 1px), linear-gradient(90deg, #bef264 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <p className="text-lg font-black tracking-[0.3em]">DROP</p>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.4em] text-lime-400">Admin</p>
            <p className="mt-3 max-w-sm text-3xl font-black uppercase leading-tight">
              Store control<br />room.
            </p>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-neutral-500">
              仅限授权管理员。所有登录尝试都会被限流并记录到操作日志。
            </p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-black px-4 py-16">
        <div className="w-full max-w-sm">
          <p className="text-lg font-black tracking-[0.3em] text-white lg:hidden">DROP</p>
          <AdminLoginBody />
        </div>
      </div>
    </main>
  );
}

async function AdminLoginBody() {
  if (await getAdminUser()) redirect(ADMIN_BASE);
  const needsSetup = (await prisma.adminUser.count()) === 0;

  return (
    <>
      <h1 className="mt-8 text-3xl font-black uppercase tracking-tight text-white lg:mt-0">
        {needsSetup ? at("login.setupTitle") : at("login.title")}
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        {needsSetup ? at("login.setupSubtitle") : at("login.subtitle")}
      </p>
      <div className="mt-8">
        <AdminAuthForm mode={needsSetup ? "setup" : "signin"} />
      </div>
    </>
  );
}
