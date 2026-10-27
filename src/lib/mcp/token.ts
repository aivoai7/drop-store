import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";

const PREFIX = "drop_mcp_";

export function hashMcpToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueMcpToken(input: { name: string; adminId: string }) {
  const token = `${PREFIX}${randomBytes(24).toString("base64url")}`;
  const row = await prisma.mcpToken.create({
    data: {
      name: input.name,
      tokenHash: hashMcpToken(token),
      prefix: token.slice(0, PREFIX.length + 6),
      adminId: input.adminId,
    },
  });
  // Returned exactly once — only the hash is stored.
  return { token, row };
}

export type McpPrincipal = { adminId: string; email: string; name: string; role: string; tokenId: string };

export async function resolveMcpToken(raw: string | null | undefined): Promise<McpPrincipal | null> {
  if (!raw) return null;
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith(PREFIX)) return null;

  const row = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashMcpToken(token) },
    include: { admin: true },
  });
  if (!row || row.revokedAt) return null;
  if (row.admin.disabled) return null;

  await prisma.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });

  return {
    adminId: row.admin.id,
    email: row.admin.email,
    name: row.admin.name,
    role: row.admin.role,
    tokenId: row.id,
  };
}

export async function revokeMcpToken(id: string) {
  await prisma.mcpToken.update({ where: { id }, data: { revokedAt: new Date() } });
}

export { PREFIX };
