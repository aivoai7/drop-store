"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "./auth";
import { canManageAdmins } from "./permissions";
import { recordAudit } from "./audit";
import { clientIp } from "./request";
import { issueMcpToken, revokeMcpToken } from "./mcp/token";

export type McpTokenState = { error?: string; token?: string; prefix?: string } | undefined;

export async function createMcpToken(
  _prev: McpTokenState,
  formData: FormData,
): Promise<McpTokenState> {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if (!canManageAdmins(admin.role)) return { error: "Only owners can create MCP tokens" };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Give the token a name, e.g. 'Claude Desktop'" };

  const { token, row } = await issueMcpToken({ name, adminId: admin.id });
  await recordAudit({
    actor: admin,
    action: "mcp.token.created",
    target: row.prefix,
    metadata: { name },
    ip: await clientIp(),
  });
  revalidatePath("/admin/mcp");
  // Returned once to the caller; the database only holds a hash.
  return { token, prefix: row.prefix };
}

export async function revokeToken(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if (!canManageAdmins(admin.role)) redirect("/admin/mcp?denied=1");

  const id = String(formData.get("id"));
  await revokeMcpToken(id);
  await recordAudit({
    actor: admin,
    action: "mcp.token.revoked",
    target: id,
    ip: await clientIp(),
  });
  revalidatePath("/admin/mcp");
  redirect("/admin/mcp?saved=1");
}
