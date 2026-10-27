import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildServer } from "@/lib/mcp/server";
import { resolveMcpToken } from "@/lib/mcp/token";
import { runWithPrincipal } from "@/lib/mcp/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Streamable HTTP MCP endpoint.
 *
 * Stateless by design: every request carries its own bearer token, so there is
 * no session to hijack and no server-side state to keep warm on serverless.
 */
async function handle(request: Request) {
  const principal = await resolveMcpToken(request.headers.get("authorization"));
  if (!principal) {
    return Response.json(
      { error: "Invalid or missing MCP token. Send 'Authorization: Bearer drop_mcp_…'." },
      { status: 401 },
    );
  }

  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return runWithPrincipal(principal, () => transport.handleRequest(request));
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}
