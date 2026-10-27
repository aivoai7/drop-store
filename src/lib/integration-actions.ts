"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "./auth";
import { canEdit } from "./permissions";
import { recordAudit } from "./audit";
import { clientIp } from "./request";
import { refreshExchangeRates } from "./exchange-rates";

export async function refreshRatesAction() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if (!canEdit(admin.role)) redirect("/admin/integrations?denied=1");

  const result = await refreshExchangeRates();

  await recordAudit({
    actor: admin,
    action: "exchange-rates.refresh",
    target: result.provider,
    metadata: { ok: result.ok, updated: result.updated.length, error: result.error },
    ip: await clientIp(),
  });

  revalidatePath("/admin/integrations");
  revalidatePath("/admin/currencies");

  const query = result.ok
    ? `updated=${result.updated.length}`
    : `error=${encodeURIComponent(result.error ?? "Refresh failed")}`;
  redirect(`/admin/integrations?${query}`);
}
