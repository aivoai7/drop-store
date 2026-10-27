import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { formatRate } from "@/lib/tax";
import { createTaxRate, deleteTaxRate, updateTaxRate } from "@/lib/settings-actions";
import { at } from "@/lib/admin-copy/zh";
import { adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

const field = "w-full border border-white/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-lime-400";

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  const { saved, error } = await searchParams;

  const rates = await prisma.taxRate.findMany({ orderBy: [{ country: "asc" }, { region: "asc" }] });
  const editable = canEdit(admin.role);

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("tax.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">
        {at("tax.rules", { count: rates.length })}
      </p>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("c.saved")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      {rates.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">{at("tax.empty")}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
              <tr>
                <th className="py-2 pr-3">{at("tax.country")}</th>
                <th className="py-2 pr-3">{at("tax.region")}</th>
                <th className="py-2 pr-3">{at("tax.label")}</th>
                <th className="py-2 pr-3">{at("tax.rate")}</th>
                <th className="py-2 pr-3">{at("tax.active")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rates.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3 font-mono text-xs">{r.country}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-neutral-500">{r.region ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {editable ? (
                      <form action={updateTaxRate} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="label" defaultValue={r.label} className={`${field} w-32`} />
                        <input name="rate" type="number" defaultValue={r.rate} className={`${field} w-20`} />
                        <input type="hidden" name="active" value={r.active ? "on" : ""} />
                        <button className="bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                          {at("c.save")}
                        </button>
                      </form>
                    ) : (
                      r.label
                    )}
                  </td>
                  <td className="py-2 pr-3 font-bold">{formatRate(r.rate)}</td>
                  <td className="py-2 pr-3 text-xs">
                    {r.active ? <span className="text-lime-400">{at("c.yes")}</span> : <span className="text-neutral-500">{at("c.no")}</span>}
                  </td>
                  <td className="py-2 text-right">
                    {editable && (
                      <form action={deleteTaxRate}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-[10px] uppercase tracking-widest text-red-400">{at("c.delete")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <form action={createTaxRate} className="mt-6 border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("tax.new")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            <input name="country" required placeholder={at("tax.countryPlaceholder")} className={field} maxLength={2} />
            <input name="region" placeholder={at("tax.regionPlaceholder")} className={field} maxLength={3} />
            <input name="label" required placeholder={at("tax.labelPlaceholder")} className={field} />
            <input name="rate" required type="number" placeholder={at("tax.ratePlaceholder")} className={field} />
            <button className="bg-lime-400 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black">
              {at("c.create")}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-neutral-600">
            {at("tax.hint")}
          </p>
        </form>
      )}
    </div>
  );
}
