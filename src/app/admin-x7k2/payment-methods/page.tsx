import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { updatePaymentMethod } from "@/lib/settings-actions";
import { stripeEnabled } from "@/lib/payments";
import { at } from "@/lib/admin-copy/zh";
import { adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

const field = "w-full border border-white/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-lime-400";

export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  const { saved } = await searchParams;

  const methods = await prisma.paymentMethod.findMany({ orderBy: { position: "asc" } });
  const editable = canEdit(admin.role);

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("pm.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">
        {at("pm.subtitle")}
      </p>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("c.saved")}</p>}
      {!stripeEnabled && (
        <p className="mt-4 border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          {at("pm.stripeOff")}
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {methods.map((m) => (
          <li key={m.id} className="border border-white/10 p-4">
            <form action={updatePaymentMethod} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="code" value={m.code} />
              <div className="min-w-48 flex-1">
                <p className="text-sm font-bold">{m.name}</p>
                <p className="text-[11px] text-neutral-500">
                  {m.description ?? m.code}
                  {m.automated ? ` · ${at("pm.automated")}` : ` · ${at("pm.offline")}`}
                </p>
              </div>
              {m.code === "bank_transfer" || m.code === "cod" ? (
                <input
                  name="instructions"
                  defaultValue={m.instructions ?? ""}
                  placeholder={at("pm.instructionsPlaceholder")}
                  className={`${field} max-w-xs`}
                />
              ) : null}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={m.enabled}
                  disabled={!editable}
                  className="h-4 w-4 accent-lime-400"
                />
                {at("pm.enabled")}
              </label>
              {editable && (
                <button className="bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-black">
                  {at("c.save")}
                </button>
              )}
            </form>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[10px] text-neutral-600">
        {at("pm.footer")}
      </p>
    </div>
  );
}
