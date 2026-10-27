"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { activate, deactivate } from "./state";
import { recordAudit } from "../audit";
import { getAdminUser } from "../auth";
import { clientIp } from "../request";

export type LicenseFormState = { error?: string; ok?: boolean } | undefined;

export async function activateLicense(
  _prev: LicenseFormState,
  formData: FormData,
): Promise<LicenseFormState> {
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { error: "请输入授权码" };

  const result = await activate(key);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    actor: null,
    action: "license.activated",
    target: result.view.domain ?? "unknown",
    metadata: { plan: result.view.plan },
    ip: await clientIp(),
  }).catch(() => {});

  // The middleware trusts this cookie; without it the redirect loops back.
  const store = await cookies();
  store.set("DROP_LICENSE_OK", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15,
  });

  revalidatePath("/license");
  redirect("/license?activated=1");
}

export async function deactivateLicense() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  await deactivate();
  revalidatePath("/license");
  redirect("/admin/license?deactivated=1");
}
