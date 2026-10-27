import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  if (!(await getAdminUser())) redirect("/admin/login");

  const [orders, products, customers, recentAudit] = await Promise.all([
    prisma.order.findMany({ select: { total: true, paymentStatus: true, status: true, createdAt: true } }),
    prisma.product.findMany({ select: { stock: true, name: true, slug: true } }),
    prisma.user.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const paid = orders.filter((o) => o.paymentStatus === "paid");
  const revenue = paid.reduce((n, o) => n + o.total, 0);
  const aov = paid.length ? Math.round(revenue / paid.length) : 0;
  const lowStock = products.filter((p) => p.stock <= 10).sort((a, b) => a.stock - b.stock);
  const pending = orders.filter((o) => o.status === "pending").length;

  const stats = [
    { label: at("dash.revenue"), value: money(revenue), href: "/admin/orders" },
    { label: at("dash.paidOrders"), value: String(paid.length), href: "/admin/orders" },
    { label: at("dash.aov"), value: money(aov), href: "/admin/orders" },
    { label: at("dash.customers"), value: String(customers), href: "/admin/customers" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">{at("dash.title")}</h1>
          <p className="mt-1 text-xs text-neutral-500">{at("dash.subtitle")}</p>
        </div>
        {pending > 0 && (
          <Link
            href="/admin/orders"
            className="bg-lime-400 px-4 py-2 text-xs font-black uppercase tracking-widest text-black"
          >
            {at("dash.pendingFulfilment", { count: pending })}
          </Link>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="border border-white/10 p-4 hover:border-white/30">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{s.label}</p>
            <p className="mt-2 text-2xl font-black">{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="border border-white/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest">{at("dash.lowStock")}</h2>
            <Link href="/admin/products" className="text-[10px] uppercase tracking-widest text-lime-400">
              {at("dash.allProducts")} →
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">{at("dash.stockHealthy")}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {lowStock.slice(0, 6).map((p) => (
                <li key={p.slug} className="flex items-center justify-between text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className={`font-bold ${p.stock === 0 ? "text-red-400" : "text-amber-400"}`}>
                    {p.stock}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-white/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest">{at("dash.recentActivity")}</h2>
            <Link href="/admin/audit" className="text-[10px] uppercase tracking-widest text-lime-400">
              {at("dash.auditLog")} →
            </Link>
          </div>
          {recentAudit.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">{at("dash.nothingYet")}</p>
          ) : (
            <ul className="mt-4 space-y-2 text-xs">
              {recentAudit.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-neutral-300">{log.action}</span>
                  <span className="shrink-0 text-neutral-600">
                    {log.createdAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
