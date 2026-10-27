import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { at } from "@/lib/admin-copy/zh";
import { ADMIN_BASE, adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  "admin.login": "Signed in",
  "admin.login.failed": "Failed sign-in",
  "admin.logout": "Signed out",
  "admin.created": "Admin created",
  "admin.password.changed": "Password changed",
  "order.status.changed": "Order status changed",
  "product.stock.changed": "Stock changed",
  "product.featured.toggled": "Featured toggled",
  "order.refunded": "Order refunded",
  "order.refund.failed": "Refund failed",
  "order.partially_refunded": "Partial refund",
  "order.payment.manual": "Marked paid manually",
  "order.payment.synced": "Payment re-synced",
  "mcp.order.refunded": "Refund (MCP)",
  "mcp.order.partially_refunded": "Partial refund (MCP)",
  "mcp.token.created": "MCP token created",
  "mcp.token.revoked": "MCP token revoked",
  "mcp.variant.stock.changed": "Stock changed (MCP)",
  "mcp.order.status.changed": "Order status (MCP)",
  "mcp.order.shipped": "Shipped (MCP)",
  "mcp.discount.created": "Discount created (MCP)",
  "mcp.product.status.changed": "Product status (MCP)",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!(await getAdminUser())) redirect(adminPath("/login"));

  const { page } = await searchParams;
  const current = Math.max(1, Number(page ?? 1) || 1);
  const perPage = 50;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (current - 1) * perPage,
      take: perPage,
    }),
    prisma.auditLog.count(),
  ]);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("audit.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">{at("audit.events", { count: total })}</p>

      {logs.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-400">{at("audit.nothing")}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/15 text-xs uppercase tracking-widest text-neutral-400">
              <tr>
                <th className="py-3 pr-4">{at("audit.when")}</th>
                <th className="py-3 pr-4">{at("audit.actor")}</th>
                <th className="py-3 pr-4">{at("audit.action")}</th>
                <th className="py-3 pr-4">{at("audit.target")}</th>
                <th className="py-3 pr-4">{at("audit.details")}</th>
                <th className="py-3">{at("audit.ip")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {logs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="whitespace-nowrap py-3 pr-4 text-xs text-neutral-400">
                    {log.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3 pr-4 text-xs">{log.actorEmail}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`text-xs font-bold uppercase tracking-wide ${
                        log.action.includes("failed") ? "text-red-400" : "text-lime-400"
                      }`}
                    >
                      {LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-neutral-300">{log.target ?? "—"}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-neutral-500">{log.metadata ?? "—"}</td>
                  <td className="py-3 font-mono text-xs text-neutral-500">{log.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-widest">
          {current > 1 && (
            <Link href={`${ADMIN_BASE}/audit?page=${current - 1}`} className="hover:text-lime-400">
              {at("audit.newer")}
            </Link>
          )}
          <span className="text-neutral-500">
            {at("audit.page", { page: current, pages })}
          </span>
          {current < pages && (
            <Link href={`${ADMIN_BASE}/audit?page=${current + 1}`} className="hover:text-lime-400">
              {at("audit.older")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
