import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { canManageAdmins } from "@/lib/permissions";
import { revokeToken } from "@/lib/mcp-actions";
import { McpTokenForm, TokenReveal } from "@/components/admin/McpTokenForm";
import { absolute } from "@/lib/site";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

export default async function McpPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; denied?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { saved, denied } = await searchParams;
  const canManage = canManageAdmins(admin.role);
  const tokens = await prisma.mcpToken.findMany({
    orderBy: { createdAt: "desc" },
    include: { admin: { select: { email: true } } },
  });
  const endpoint = absolute("/api/mcp");

  const config = JSON.stringify(
    {
      mcpServers: {
        "drop-admin": {
          url: endpoint,
          headers: { Authorization: "Bearer <YOUR_TOKEN>" },
        },
      },
    },
    null,
    2,
  );

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("mcp.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">
        {at("mcp.subtitle")}
      </p>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("c.saved")}</p>}
      {denied && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{at("mcp.ownerOnly")}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("mcp.endpoint")}</h2>
          <p className="mt-2 break-all font-mono text-xs text-lime-400">{endpoint}</p>
          <p className="mt-2 text-[11px] text-neutral-500">
            {at("mcp.endpointHint").replace("Authorization", "Authorization")}{" "}
            <code className="text-neutral-300">Authorization: Bearer drop_mcp_…</code>
          </p>

          <h3 className="mt-5 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            {at("mcp.clientConfig")}
          </h3>
          <pre className="mt-2 overflow-x-auto border border-white/10 bg-black p-3 text-[11px] text-neutral-300">
            {config}
          </pre>
        </section>

        <section className="border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("mcp.localStdio")}</h2>
          <p className="mt-2 text-[11px] text-neutral-500">
            {at("mcp.localHint")}
          </p>
          <pre className="mt-2 overflow-x-auto border border-white/10 bg-black p-3 text-[11px] text-neutral-300">
{`{
  "mcpServers": {
    "drop-admin": {
      "command": "npm",
      "args": ["run", "mcp"],
      "env": { "DROP_MCP_TOKEN": "<YOUR_TOKEN>" },
      "cwd": "${process.cwd()}"
    }
  }
}`}
          </pre>
          <p className="mt-2 text-[11px] text-neutral-500">
            {at("mcp.tokenOnce")}
          </p>
        </section>
      </div>

      {canManage ? (
        <McpTokenForm />
      ) : (
        <p className="mt-8 text-xs text-neutral-500">{at("mcp.ownerOnly")}</p>
      )}

      <h2 className="mt-10 text-xs font-black uppercase tracking-widest text-neutral-400">{at("mcp.tokens")}</h2>
      {tokens.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">{at("mcp.noTokens")}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
              <tr>
                <th className="py-2 pr-3">{at("mcp.name")}</th>
                <th className="py-2 pr-3">{at("mcp.prefix")}</th>
                <th className="py-2 pr-3">{at("mcp.owner")}</th>
                <th className="py-2 pr-3">{at("mcp.lastUsed")}</th>
                <th className="py-2 pr-3">{at("mcp.state")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 pr-3 font-bold">{t.name}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-neutral-400">{t.prefix}…</td>
                  <td className="py-2 pr-3 text-xs text-neutral-400">{t.admin.email}</td>
                  <td className="py-2 pr-3 text-[11px] text-neutral-500">
                    {t.lastUsedAt ? t.lastUsedAt.toLocaleString("zh-CN") : at("c.never")}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        t.revokedAt ? "bg-white/10 text-neutral-400" : "bg-lime-400/15 text-lime-400"
                      }`}
                    >
                      {t.revokedAt ? at("mcp.revoked") : at("c.active")}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {!t.revokedAt && canManage && (
                      <form action={revokeToken}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="border border-red-500/40 px-2 py-1 text-[10px] uppercase tracking-wider text-red-400">
                          {at("mcp.revoke")}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TokenReveal />
    </div>
  );
}
