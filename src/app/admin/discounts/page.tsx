import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { canEdit } from "@/lib/permissions";
import { createDiscount, deleteDiscount, toggleDiscount } from "@/lib/discount-actions";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-400";
const label = "block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1";

export default async function DiscountsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; denied?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { saved, error, denied } = await searchParams;
  const discounts = await prisma.discount.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });
  const editable = canEdit(admin.role);
  const now = new Date();

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("disc.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">{discounts.length} codes</p>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("c.saved")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      {denied && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{at("acc.ownerOnly")}</p>}

      {editable && (
        <form action={createDiscount} className="mt-6 border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("disc.new")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={label}>{at("disc.code")}</label>
              <input name="code" required placeholder="WELCOME10" className={`${field} uppercase`} />
            </div>
            <div>
              <label className={label}>{at("disc.type")}</label>
              <select name="type" className={field} defaultValue="percentage">
                <option value="percentage">{at("disc.typePct")}</option>
                <option value="fixed">{at("disc.typeFixed")}</option>
              </select>
            </div>
            <div>
              <label className={label}>{at("disc.value")}</label>
              <input name="value" required placeholder="10" className={field} />
            </div>
            <div>
              <label className={label}>{at("disc.minSpend")}</label>
              <input name="minSubtotal" placeholder="0" className={field} />
            </div>
            <div>
              <label className={label}>{at("disc.usageLimit")}</label>
              <input name="usageLimit" type="number" min={1} placeholder={at("disc.unlimited")} className={field} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="active" defaultChecked className="h-4 w-4 accent-lime-400" />
              {at("c.active")}
            </label>
            <div>
              <label className={label}>{at("disc.starts")}</label>
              <input name="startsAt" type="datetime-local" className={field} />
            </div>
            <div>
              <label className={label}>{at("disc.ends")}</label>
              <input name="endsAt" type="datetime-local" className={field} />
            </div>
            <div className="flex items-end">
              <button className="w-full bg-lime-400 py-2.5 text-[10px] font-black uppercase tracking-widest text-black">
                {at("disc.create")}
              </button>
            </div>
          </div>
        </form>
      )}

      {discounts.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">{at("disc.noCodes")}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
              <tr>
                <th className="py-2 pr-3">{at("disc.code")}</th>
                <th className="py-2 pr-3">{at("disc.title")}</th>
                <th className="py-2 pr-3">{at("disc.minSpend")}</th>
                <th className="py-2 pr-3">{at("disc.used")}</th>
                <th className="py-2 pr-3">{at("disc.window")}</th>
                <th className="py-2 pr-3">{at("disc.state")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {discounts.map((d) => {
                const expired = d.endsAt && d.endsAt < now;
                const exhausted = d.usageLimit !== null && d.usedCount >= d.usageLimit;
                const state = !d.active ? at("c.inactive") : expired ? at("disc.expired") : exhausted ? at("disc.exhausted") : at("disc.live");
                return (
                  <tr key={d.id}>
                    <td className="py-2 pr-3 font-mono text-xs font-bold">{d.code}</td>
                    <td className="py-2 pr-3 text-xs">
                      {d.type === "percentage" ? at("disc.offPct", { value: d.value }) : at("disc.offFixed", { value: money(d.value) })}
                    </td>
                    <td className="py-2 pr-3 text-xs text-neutral-400">
                      {d.minSubtotal ? money(d.minSubtotal) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {d.usedCount}
                      {d.usageLimit !== null ? ` / ${d.usageLimit}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-[11px] text-neutral-500">
                      {d.startsAt ? d.startsAt.toLocaleDateString("en-US") : "—"} →{" "}
                      {d.endsAt ? d.endsAt.toLocaleDateString("en-US") : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          state === at("disc.live")
                            ? "bg-lime-400/15 text-lime-400"
                            : state === at("c.inactive")
                              ? "bg-white/10 text-neutral-400"
                              : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {state}
                      </span>
                    </td>
                    <td className="py-2">
                      {editable && (
                        <div className="flex justify-end gap-2">
                          <form action={toggleDiscount}>
                            <input type="hidden" name="id" value={d.id} />
                            <button className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-wider">
                              {d.active ? at("disc.deactivate") : at("disc.activate")}
                            </button>
                          </form>
                          <form action={deleteDiscount}>
                            <input type="hidden" name="id" value={d.id} />
                            <button className="border border-red-500/40 px-2 py-1 text-[10px] uppercase tracking-wider text-red-400">
                              {at("c.delete")}
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
