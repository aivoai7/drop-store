#!/usr/bin/env tsx
/**
 * Stdio entry point for local MCP clients (Claude Desktop, Cursor, Claude Code).
 *
 * Auth: set DROP_MCP_TOKEN, or DROP_MCP_TOKEN_FILE pointing at a file
 * containing the token. Without one the process refuses to start.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { buildServer } from "../src/lib/mcp/server";
import { resolveMcpToken } from "../src/lib/mcp/token";
import { runWithPrincipal } from "../src/lib/mcp/context";
import { prisma } from "../src/lib/db";

function readToken() {
  const direct = process.env.DROP_MCP_TOKEN?.trim();
  if (direct) return direct;
  const file = process.env.DROP_MCP_TOKEN_FILE;
  if (file) return readFileSync(file, "utf8").trim();
  return null;
}

async function main() {
  const token = readToken();
  if (!token) {
    console.error("DROP_MCP_TOKEN (or DROP_MCP_TOKEN_FILE) is required");
    process.exit(1);
  }

  const principal = await resolveMcpToken(token);
  if (!principal) {
    console.error("That MCP token is invalid, revoked, or its admin is disabled");
    process.exit(1);
  }

  // Everything in this process runs as that admin; stdout is reserved for the
  // protocol, so all diagnostics must go to stderr.
  await runWithPrincipal(principal, async () => {
    const server = buildServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`drop-admin MCP ready as ${principal.email} (${principal.role})`);
  });

  const shutdown = async () => {
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
