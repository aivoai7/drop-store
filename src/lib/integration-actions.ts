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
  if (!admin) redirect(adminPath("/login"));
  if (!canEdit(admin.role)) redirect(adminPath("/integrations?denied=1"));

  const result = await refreshExchangeRates();

  await recordAudit({
    actor: admin,
    action: "exchange-rates.refresh",
    target: result.provider,
    metadata: { ok: result.ok, updated: result.updated.length, error: result.error },
    ip: await clientIp(),
  });

  revalidatePath(adminPath("/integrations"));
  revalidatePath(adminPath("/currencies"));

  const query = result.ok
    ? `updated=${result.updated.length}`
    : `error=${encodeURIComponent(result.error ?? "Refresh failed")}`;
  redirect(`${ADMIN_BASE}/integrations?${query}`);
}

/* ---------------- payment gateways ---------------- */

import { saveGatewaySecrets, deleteGatewaySecrets } from "./gateway-config";
import { ADMIN_BASE, adminPath } from "@/lib/admin-path";

export type GatewayFormState = { error?: string } | undefined;

function redirectWith(search: string) {
  revalidatePath(adminPath("/integrations"));
  redirect(`${ADMIN_BASE}/integrations?${search}`);
}

export async function saveGatewayKeys(_prev: GatewayFormState, formData: FormData): Promise<GatewayFormState> {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  if (!canEdit(admin.role)) redirect(adminPath("/integrations?denied=1"));

  const gateway = String(formData.get("gateway") ?? "");
  if (gateway !== "stripe" && gateway !== "paypal") return { error: "未知网关" };

  const get = (k: string) => String(formData.get(k) ?? "").trim();

  let secrets: Record<string, string>;
  if (gateway === "stripe") {
    const secretKey = get("secretKey");
    const webhookSecret = get("webhookSecret");
    if (!secretKey) return { error: "at least secretKey" };
    secrets = { secretKey, ...(webhookSecret ? { webhookSecret } : {}) };
  } else {
    const clientId = get("clientId");
    const clientSecret = get("clientSecret");
    const webhookId = get("webhookId");
    if (!clientId || !clientSecret) return { error: "at least clientId+clientSecret" };
    secrets = { clientId, clientSecret, ...(webhookId ? { webhookId } : {}) };
  }

  const result = await saveGatewaySecrets(gateway, secrets);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    actor: admin,
    action: `gateway.${gateway}.keysSaved`,
    target: gateway,
    ip: await clientIp(),
  });
  redirectWith("saved=1");
}

export async function removeGatewayKeys(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  if (!canEdit(admin.role)) redirect(adminPath("/integrations?denied=1"));

  const gateway = String(formData.get("gateway") ?? "");
  if (gateway !== "stripe" && gateway !== "paypal") return;

  await deleteGatewaySecrets(gateway);
  await recordAudit({
    actor: admin,
    action: `gateway.${gateway}.keysRemoved`,
    target: gateway,
    ip: await clientIp(),
  });
  redirectWith("removed=1");
}
