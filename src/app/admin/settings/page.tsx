import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { getSettings } from "@/lib/store-settings";
import { saveStoreSettings } from "@/lib/settings-actions";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

const field = "w-full border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-400";
const label = "mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-500";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; denied?: string; error?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { saved, denied, error } = await searchParams;
  const settings = await getSettings();
  const editable = canEdit(admin.role);

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("set.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">{at("set.subtitle")}</p>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("set.savedBanner")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      {denied && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{at("acc.ownerOnly")}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          ["/admin/tax", at("nav.tax")],
          ["/admin/shipping", at("nav.shipping")],
          ["/admin/currencies", at("nav.currencies")],
          ["/admin/payment-methods", at("nav.paymentMethods")],
        ].map(([href, text]) => (
          <Link key={href} href={href} className="border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:border-white">
            {text} →
          </Link>
        ))}
      </div>

      <form action={saveStoreSettings} className="mt-8 space-y-6">
        <section className="border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("set.tax")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="taxEnabled" defaultChecked={settings.taxEnabled} className="h-4 w-4 accent-lime-400" />
              {at("set.taxEnabled")}
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="pricesIncludeTax" defaultChecked={settings.pricesIncludeTax} className="h-4 w-4 accent-lime-400" />
              {at("set.pricesIncludeTax")}
            </label>
            <div>
              <span className={label}>{at("set.taxBasis")}</span>
              <select name="taxBasis" defaultValue={settings.taxBasis} className={field}>
                <option value="shipping">{at("set.taxBasisShipping")}</option>
                <option value="billing">{at("set.taxBasisBilling")}</option>
              </select>
            </div>
            <div>
              <span className={label}>{at("set.fallbackRate")}</span>
              <input name="fallbackTaxRate" type="number" min={0} defaultValue={settings.fallbackTaxRate} className={field} />
              <p className="mt-1 text-[10px] text-neutral-600">{at("set.fallbackHint")}</p>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="taxShipping" defaultChecked={settings.taxShipping} className="h-4 w-4 accent-lime-400" />
              {at("set.taxShipping")}
            </label>
          </div>
          <p className="mt-3 text-[10px] text-neutral-600">
            {at("set.taxRatesLink")} <Link href="/admin/tax" className="text-lime-400">{at("tax.title")}</Link>.
          </p>
        </section>

        <section className="border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("set.shipping")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>{at("set.freeOver")}</span>
              <input name="freeShippingThreshold" defaultValue={(settings.freeShippingThreshold / 100).toFixed(2)} className={field} />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-neutral-600">
            {at("set.shippingMethodsLink")} <Link href="/admin/shipping" className="text-lime-400">{at("nav.shipping")}</Link>.
          </p>
        </section>

        <section className="border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("set.invoices")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <span className={label}>{at("set.invoicePrefix")}</span>
              <input name="invoicePrefix" defaultValue={settings.invoicePrefix} className={field} maxLength={8} />
            </div>
            <div>
              <span className={label}>{at("set.invoiceNext")}</span>
              <input value={settings.invoiceNextNumber} readOnly className={`${field} text-neutral-500`} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="invoiceShowTaxId" defaultChecked={settings.invoiceShowTaxId} className="h-4 w-4 accent-lime-400" />
              {at("set.invoiceTaxNote")}
            </label>
          </div>
        </section>

        {editable && (
          <button className="bg-lime-400 px-6 py-2.5 text-xs font-black uppercase tracking-widest text-black">
            {at("set.save")}
          </button>
        )}
        {!editable && <p className="text-xs text-neutral-500">{at("set.readOnly")}</p>}
      </form>
    </div>
  );
}
