import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { createCurrency, deleteCurrency, updateCurrency } from "@/lib/settings-actions";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

const field = "w-full border border-white/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-lime-400";

export default async function CurrenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  const { saved, error } = await searchParams;

  const currencies = await prisma.currency.findMany({ orderBy: { position: "asc" } });
  const editable = canEdit(admin.role);

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("cur.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">
        {at("cur.subtitle")}
      </p>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("c.saved")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
            <tr>
              <th className="py-2 pr-3">{at("cur.code")}</th>
              <th className="py-2 pr-3">{at("c.name")}</th>
              <th className="py-2 pr-3">{at("cur.symbol")}</th>
              <th className="py-2 pr-3">{at("cur.rate")}</th>
              <th className="py-2 pr-3">{at("cur.decimals")}</th>
              <th className="py-2 pr-3">{at("cur.active")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {currencies.map((c) => (
              <tr key={c.code}>
                <td className="py-2 pr-3 font-mono text-xs font-bold">{c.code.toUpperCase()}</td>
                <td className="py-2 pr-3">{c.name}</td>
                <td className="py-2 pr-3">{c.symbol}</td>
                <td className="py-2 pr-3">
                  {editable ? (
                    <form action={updateCurrency} className="flex items-center gap-1">
                      <input type="hidden" name="code" value={c.code} />
                      <input name="rate" defaultValue={c.rate} className={`${field} w-24`} />
                      <input name="decimals" defaultValue={c.decimals} className={`${field} w-14`} />
                      <input type="hidden" name="active" value={c.active ? "on" : ""} />
                      <button className="bg-white px-2 py-1 text-[10px] font-bold uppercase text-black">{at("c.save")}</button>
                    </form>
                  ) : (
                    c.rate
                  )}
                </td>
                <td className="py-2 pr-3">{c.decimals}</td>
                <td className="py-2 pr-3 text-xs">{c.active ? <span className="text-lime-400">{at("c.yes")}</span> : "no"}</td>
                <td className="py-2 text-right">
                  {editable && c.code !== "usd" && (
                    <form action={deleteCurrency}>
                      <input type="hidden" name="code" value={c.code} />
                      <button className="text-[10px] uppercase tracking-widest text-red-400">{at("c.delete")}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <form action={createCurrency} className="mt-6 border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("cur.add")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-6">
            <input name="code" required placeholder={at("cur.codePlaceholder")} className={field} maxLength={3} />
            <input name="name" required placeholder={at("cur.namePlaceholder")} className={field} />
            <input name="symbol" required placeholder="€" className={field} />
            <input name="rate" required placeholder="0.92" className={field} />
            <input name="decimals" defaultValue="2" className={field} />
            <button className="bg-lime-400 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black">
              {at("c.create")}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-neutral-600">
            {at("cur.rateHint")}
          </p>
        </form>
      )}
    </div>
  );
}
