import { AsyncLocalStorage } from "node:async_hooks";
import { recordAudit } from "../audit";
import { canEdit, canManageAdmins } from "../permissions";
import type { McpPrincipal } from "./token";

/**
 * The MCP transport stays anonymous and each request carries its own token, so
 * the resolved principal is threaded through async context instead of being
 * passed to every tool handler.
 */
const store = new AsyncLocalStorage<McpPrincipal>();

export function runWithPrincipal<T>(principal: McpPrincipal, fn: () => Promise<T>) {
  return store.run(principal, fn);
}

export function currentPrincipal(): McpPrincipal {
  const principal = store.getStore();
  if (!principal) throw new Error("No MCP principal for this request");
  return principal;
}

export class McpToolError extends Error {}

export function requireEdit() {
  const principal = currentPrincipal();
  if (!canEdit(principal.role)) {
    throw new McpToolError(
      `Your role (${principal.role}) is read-only. Ask an owner for manager access.`,
    );
  }
  return principal;
}

export function requireOwner() {
  const principal = currentPrincipal();
  if (!canManageAdmins(principal.role)) {
    throw new McpToolError("Only owners can perform this action.");
  }
  return principal;
}

/** Every MCP write lands in the same audit log as the web admin. */
export async function auditMcp(action: string, target?: string, metadata?: Record<string, unknown>) {
  const principal = currentPrincipal();
  await recordAudit({
    actor: { id: principal.adminId, email: principal.email },
    action: `mcp.${action}`,
    target,
    metadata,
    ip: "mcp",
  });
}
