import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { canEdit } from "@/lib/permissions";
import { updateOrderStatus, refundOrderAction } from "@/lib/order-actions";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "paid", "shipped", "cancelled"] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { status, q = "" } = await searchParams;
  const active = STATUSES.includes(status as (typeof STATUSES)[number]) ? status : undefined;
  const search = q.trim();

  const orders = await prisma.order.findMany({
    where: {
      ...(active ? { status: active } : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  const editable = canEdit(admin.role);
  const backTo = active ? `/admin/orders?status=${active}` : "/admin/orders";

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("ord.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">{at("ord.shown", { count: orders.length })}</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["all", ...STATUSES] as const).map((f) => {
          const isActive = f === "all" ? !active : f === active;
          return (
            <Link
              key={f}
              href={f === "all" ? "/admin/orders" : `/admin/orders?status=${f}`}
              className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
                isActive ? "border-lime-400 bg-lime-400 text-black" : "border-white/20 hover:border-white"
              }`}
            >
              {f}
            </Link>
          );
        })}
        <form className="ml-auto flex gap-2">
          {active && <input type="hidden" name="status" value={active} />}
          <input
            name="q"
            defaultValue={search}
            placeholder={at("ord.searchPlaceholder")}
            className="w-52 border border-white/20 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-lime-400"
          />
          <button className="border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest">
            Find
          </button>
        </form>
      </div>

      {orders.length === 0 ? (
        <p className="mt-10 text-sm text-neutral-500">{at("ord.noOrders")}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="border border-white/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/admin/orders/${order.id}`} className="font-mono text-sm hover:text-lime-400">
                    {order.id}
                  </Link>
                  <p className="mt-1 text-xs text-neutral-400">
                    {order.name} · {order.email}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {order.address}, {order.city}, {order.country}
                  </p>
                  {order.trackingNumber && (
                    <p className="mt-1 text-[11px] text-lime-400">
                      {order.carrier ? `${order.carrier} · ` : ""}
                      {order.trackingNumber}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{money(order.total)}</span>
                  <span
                    className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                      order.paymentStatus === "paid"
                        ? "bg-lime-400 text-black"
                        : order.paymentStatus === "refunded"
                          ? "bg-neutral-700"
                          : order.paymentStatus === "failed"
                            ? "bg-red-500"
                            : "bg-neutral-800 text-neutral-300"
                    }`}
                  >
                    {order.paymentStatus}
                  </span>
                  {order.discountCode && (
                    <span className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-300">
                      {order.discountCode}
                    </span>
                  )}
                </div>
              </div>

              <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-neutral-400">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.name} — {item.color} / {item.size} ×{item.quantity}
                    </span>
                    <span>{money(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>

              {editable ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={updateOrderStatus} className="flex gap-2">
                    <input type="hidden" name="id" value={order.id} />
                    <input type="hidden" name="backTo" value={backTo} />
                    <select
                      name="status"
                      defaultValue={order.status}
                      className="border border-white/20 bg-black px-2 py-1.5 text-[11px] uppercase tracking-wider"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button className="bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-black">
                      {at("ord.update")}
                    </button>
                  </form>
                  {order.paymentStatus === "paid" && (
                    <form action={refundOrderAction}>
                      <input type="hidden" name="id" value={order.id} />
                      <input type="hidden" name="backTo" value={backTo} />
                      <button className="border border-white/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider hover:bg-white hover:text-black">
                        {at("ord.refund")}
                      </button>
                    </form>
                  )}
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="border border-white/20 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-300 hover:border-white"
                  >
                    {at("ord.details")}
                  </Link>
                  <span className="ml-auto text-[10px] text-neutral-600">
                    {order.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-3">
                  <Link href={`/admin/orders/${order.id}`} className="text-[11px] uppercase tracking-widest text-lime-400">
                    Details →
                  </Link>
                  <span className="ml-auto text-[10px] text-neutral-600">
                    {order.createdAt.toLocaleDateString("en-US")}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
