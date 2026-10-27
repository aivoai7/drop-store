import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { canEdit } from "@/lib/permissions";
import { resetCustomerPassword, toggleCustomerDisabled } from "@/lib/admin-actions";
import { at } from "@/lib/admin-copy/zh";
import { ADMIN_BASE, adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-400";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));

  const { id } = await params;
  const { saved, error } = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      orders: { include: { items: true }, orderBy: { createdAt: "desc" } },
      sessions: { select: { id: true, createdAt: true, expiresAt: true } },
    },
  });
  if (!user) notFound();

  const editable = canEdit(admin.role);
  const backTo = `${ADMIN_BASE}/customers/${user.id}`;
  const spent = user.orders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((n, o) => n + o.total, 0);
  const activeSessions = user.sessions.filter((s) => s.expiresAt > new Date()).length;

  return (
    <div>
      <Link href={adminPath("/customers")} className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white">
        ← {at("cust.title")}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{user.name}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {user.email} · joined {user.createdAt.toLocaleDateString("en-US")}
          </p>
        </div>
        {user.disabled && (
          <span className="bg-red-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
            {at("cust.disabledBanner")}
          </span>
        )}
      </div>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("cust.saved")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          [at("cust.orders"), String(user.orders.length)],
          [at("cust.spent"), money(spent)],
          [at("cust.activeSessions"), String(activeSessions)],
        ].map(([label, value]) => (
          <div key={label} className="border border-white/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
            <p className="mt-1 text-xl font-black">{value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-xs font-black uppercase tracking-widest text-neutral-400">{at("cust.orders")}</h2>
      {user.orders.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">{at("cust.noOrders")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {user.orders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 border border-white/10 p-3 text-sm">
              <Link href={`${ADMIN_BASE}/orders/${order.id}`} className="font-mono text-xs hover:text-lime-400">
                {order.id}
              </Link>
              <span className="text-xs text-neutral-500">
                {order.createdAt.toLocaleDateString("en-US")} · {order.items.length} item
                {order.items.length === 1 ? "" : "s"}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-neutral-400">{order.status}</span>
              <span className="font-bold">{money(order.total)}</span>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <section className="border border-white/10 p-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("cust.resetPassword")}</h2>
            <p className="mt-1 text-[10px] text-neutral-600">
              {at("cust.resetHint")}
            </p>
            <form action={resetCustomerPassword} className="mt-3 space-y-2">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="backTo" value={backTo} />
              <input name="password" type="text" required minLength={8} placeholder={at("cust.newPassword")} className={field} />
              <button className="w-full bg-white py-2 text-[10px] font-black uppercase tracking-widest text-black">
                {at("cust.setPassword")}
              </button>
            </form>
          </section>

          <section className="border border-white/10 p-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("cust.access")}</h2>
            <p className="mt-1 text-[10px] text-neutral-600">
              {at("cust.accessHint")}
            </p>
            <form action={toggleCustomerDisabled} className="mt-3">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="backTo" value={backTo} />
              <button
                className={`w-full border py-2 text-[10px] font-black uppercase tracking-widest ${
                  user.disabled
                    ? "border-lime-400/50 text-lime-400 hover:bg-lime-400 hover:text-black"
                    : "border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white"
                }`}
              >
                {user.disabled ? at("cust.enable") : at("cust.disable")}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
