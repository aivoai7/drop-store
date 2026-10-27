import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { AdminAuthForm } from "@/components/AdminAuthForm";
import { at } from "@/lib/admin-copy/zh";
import { ADMIN_BASE } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getAdminUser()) redirect(ADMIN_BASE);
  const needsSetup = (await prisma.adminUser.count()) === 0;

  return (
    <div className="mx-auto max-w-sm px-4 py-24">
      <h1 className="text-3xl font-black uppercase tracking-tight">
        {needsSetup ? at("login.setupTitle") : at("login.title")}
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        {needsSetup
          ? at("login.setupSubtitle")
          : at("login.subtitle")}
      </p>
      <AdminAuthForm mode={needsSetup ? "setup" : "signin"} />
    </div>
  );
}
