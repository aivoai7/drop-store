import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { gateways } from "@/lib/gateways";
import { providers, activeProvider } from "@/lib/tax-providers";
import { exchangeRatesConfigured } from "@/lib/exchange-rates";
import { refreshRatesAction } from "@/lib/integration-actions";
import { managedGatewayIds, encryptionKeyAvailable } from "@/lib/gateway-config";
import { GatewayConfigForm } from "@/components/GatewayConfigForm";
import { at } from "@/lib/admin-copy/zh";
import { adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

const status = (ok: boolean | "db" | "env" | null) =>
  ok ? "bg-lime-400/15 text-lime-400" : "bg-white/10 text-neutral-400";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string; denied?: string; saved?: string; removed?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  const { updated, error, denied, saved, removed } = await searchParams;

  const currencies = await prisma.currency.findMany({ orderBy: { position: "asc" } });
  const tax = await activeProvider();
  const editable = canEdit(admin.role);
  const managed = await managedGatewayIds();
  const encKeyAvailable = encryptionKeyAvailable();

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("int.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">
        {at("int.subtitle")}
      </p>

      {updated && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("int.ratesRefreshed", { count: updated ?? 0 })}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      {denied && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{at("acc.ownerOnly")}</p>}
      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("int.saved")}</p>}
      {removed && <p className="mt-4 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{at("int.removed")}</p>}

      <h2 className="mt-8 text-xs font-black uppercase tracking-widest text-neutral-400">{at("int.gateways")}</h2>
      <ul className="mt-3 space-y-2">
        {await Promise.all(
          gateways.map(async (g) => {
            const configured = await g.isConfigured();
            const isManaged = managed.includes(g.code);
            return (
              <li key={g.code} className="flex flex-wrap items-center justify-between gap-3 border border-white/10 p-4">
                <div>
                  <p className="text-sm font-bold">{g.label}</p>
                  <p className="text-[11px] text-neutral-500">
                    {g.code === "stripe"
                      ? "Cards, Apple Pay, Google Pay via Checkout"
                      : "PayPal Checkout, refunds via capture API"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${status(configured)}`}>
                    {configured ? (configured === "db" ? at("int.configuredViaDb") : at("int.configuredViaEnv")) : at("int.notConfigured")}
                  </span>
                  {editable && (
                    <GatewayConfigForm
                      gateway={g.code}
                      label={g.label}
                      managed={isManaged}
                      canEncrypt={encKeyAvailable}
                    />
                  )}
                </div>
              </li>
            );
          }),
        )}
      </ul>

      <h2 className="mt-8 text-xs font-black uppercase tracking-widest text-neutral-400">{at("int.taxEngine")}</h2>
      <ul className="mt-3 space-y-2">
        {await Promise.all(
          providers.map(async (p) => {
          const configured = await p.isConfigured();
          const isActive = p.code === tax.code;
          return (
            <li key={p.code} className={`flex flex-wrap items-center justify-between gap-3 border p-4 ${isActive ? "border-lime-400/40" : "border-white/10"}`}>
              <div>
                <p className="text-sm font-bold">{p.label}</p>
                <p className="text-[11px] text-neutral-500">{p.code}</p>
              </div>
              <div className="flex items-center gap-3">
                {isActive && (
                  <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-lime-400 text-black">
                    {at("int.active")}
                  </span>
                )}
                <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${status(configured)}`}>
                  {configured ? at("int.available") : at("int.notConfigured")}
                </span>
              </div>
            </li>
          );
          }),
        )}
      </ul>
      <p className="mt-2 text-[10px] text-neutral-600">
        {at("int.taxProviderHint")}
      </p>

      <h2 className="mt-8 text-xs font-black uppercase tracking-widest text-neutral-400">{at("int.exchangeRates")}</h2>
      <div className="mt-3 border border-white/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">
              {at("int.providerConnected") /* a provider is always on now; the free feed needs no key */}
            </p>
            <p className="text-[11px] text-neutral-500">
              {exchangeRatesConfigured() ? at("int.refreshHint") : at("int.manualHint")}
            </p>
          </div>
          {editable && exchangeRatesConfigured() && (
            <form action={refreshRatesAction}>
              <button className="bg-lime-400 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black">
                {at("int.refreshNow")}
              </button>
            </form>
          )}
        </div>

        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
            <tr>
              <th className="py-2 pr-3">{at("cur.title")}</th>
              <th className="py-2 pr-3">{at("cur.rate")}</th>
              <th className="py-2">{at("cur.active")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {currencies.map((c) => (
              <tr key={c.code}>
                <td className="py-2 pr-3 font-mono text-xs font-bold">{c.code.toUpperCase()}</td>
                <td className="py-2 pr-3">{c.rate}</td>
                <td className="py-2 text-xs">{c.active ? at("c.yes") : at("c.no")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
