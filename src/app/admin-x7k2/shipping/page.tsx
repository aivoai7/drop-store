import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { canEdit } from "@/lib/permissions";
import { createShippingMethod, deleteShippingMethod, updateShippingMethod } from "@/lib/settings-actions";
import { at } from "@/lib/admin-copy/zh";
import { adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

const field = "w-full border border-white/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-lime-400";

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  const { saved, error } = await searchParams;

  const methods = await prisma.shippingMethod.findMany({ orderBy: [{ position: "asc" }] });
  const editable = canEdit(admin.role);

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("ship.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">{at("ship.methods", { count: methods.length })}</p>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("c.saved")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      {methods.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">
          {at("ship.empty")}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {methods.map((m) => {
            const countries = m.countries ? (JSON.parse(m.countries) as string[]) : null;
            return (
              <li key={m.id} className="border border-white/10 p-4">
                {editable ? (
                  <form action={updateShippingMethod} className="grid gap-3 sm:grid-cols-6">
                    <input type="hidden" name="id" value={m.id} />
                    <div className="sm:col-span-2">
                      <input name="name" defaultValue={m.name} className={field} />
                      <input name="description" defaultValue={m.description ?? ""} placeholder="Description" className={`${field} mt-1`} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">{at("ship.price")}</label>
                      <input name="price" defaultValue={(m.price / 100).toFixed(2)} className={field} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">{at("ship.freeOver")}</label>
                      <input name="freeOver" defaultValue={m.freeOver ? (m.freeOver / 100).toFixed(2) : ""} placeholder={at("ship.inherit")} className={field} />
                    </div>
                    <label className="flex items-center gap-2 self-end pb-2 text-xs">
                      <input type="checkbox" name="active" defaultChecked={m.active} className="h-4 w-4 accent-lime-400" />
                      {at("c.active")}
                    </label>
                    <div className="flex items-end">
                      <button className="w-full bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-black">
                        {at("c.save")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold">{m.name}</span>
                    <span>{m.price === 0 ? "Free" : money(m.price)}</span>
                  </div>
                )}
                <p className="mt-2 text-[10px] text-neutral-600">
                  {countries ? countries.join(", ") : at("ship.allCountries")}
                  {m.minSubtotal > 0 ? ` · ${at("ship.minSubtotal")} ${money(m.minSubtotal)}` : ""}
                  {m.freeOver ? ` · ${at("ship.freeOver")} ${money(m.freeOver)}` : ` · ${at("ship.inherit")}`}
                </p>
                {editable && (
                  <form action={deleteShippingMethod} className="mt-1 flex justify-end">
                    <input type="hidden" name="id" value={m.id} />
                    <button className="text-[10px] uppercase tracking-widest text-red-400">{at("ship.delete")}</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <form action={createShippingMethod} className="mt-6 border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("ship.new")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-6">
            <input name="name" required placeholder="标准配送" className={field} />
            <input name="description" placeholder={at("ship.descriptionPlaceholder")} className={field} />
            <input name="price" placeholder="12.00" className={field} />
            <input name="freeOver" placeholder={at("ship.freeOver")} className={field} />
            <input name="countries" placeholder={at("ship.countriesPlaceholder")} className={`${field} sm:col-span-2`} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] text-neutral-600">{at("ship.newHint")}</p>
            <button className="bg-lime-400 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black">
              {at("c.create")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
