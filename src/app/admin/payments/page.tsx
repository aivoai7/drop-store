import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { canEdit } from "@/lib/permissions";
import { refundOrderAction } from "@/lib/order-actions";
import { stripeEnabled } from "@/lib/payments";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: at("pay.tabAll") },
  { key: "paid", label: at("pay.tabPaid") },
  { key: "partially_refunded", label: at("pay.tabPartial") },
  { key: "refunded", label: at("pay.tabRefunded") },
  { key: "failed", label: at("pay.tabFailed") },
  { key: "pending", label: at("pay.tabPending") },
];

const badge = (status: string) =>
  status === "paid"
    ? "bg-lime-400 text-black"
    : status === "partially_refunded"
      ? "bg-amber-400 text-black"
      : status === "refunded"
        ? "bg-neutral-700"
        : status === "failed"
          ? "bg-red-500"
          : "bg-neutral-800 text-neutral-300";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; error?: string; refunded?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { status = "all", q = "", error, refunded } = await searchParams;
  const search = q.trim();
  const editable = canEdit(admin.role);

  const orders = await prisma.order.findMany({
    where: {
      ...(status !== "all" ? { paymentStatus: status } : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const all = await prisma.order.findMany({
    select: { total: true, paymentStatus: true, refundAmount: true },
  });
  const gross = all
    .filter((o) => ["paid", "partially_refunded", "refunded"].includes(o.paymentStatus))
    .reduce((n, o) => n + o.total, 0);
  const refundedTotal = all.reduce((n, o) => n + (o.refundAmount ?? 0), 0);
  const net = gross - refundedTotal;
  const outstanding = all
    .filter((o) => o.paymentStatus === "pending")
    .reduce((n, o) => n + o.total, 0);

  const events = await prisma.paymentEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("pay.title")}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {stripeEnabled ? at("pay.stripeOn") : at("pay.stripeOff")}
          </p>
        </div>
      </div>

      {!stripeEnabled && (
        <p className="mt-4 border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          {at("pay.stripeOffHint")}
        </p>
      )}
      {refunded && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("ord.refundIssued")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [at("pay.gross"), money(gross)],
          [at("pay.refunded"), money(refundedTotal)],
          [at("pay.net"), money(net)],
          [at("pay.unpaid"), money(outstanding)],
        ].map(([label, value]) => (
          <div key={label} className="border border-white/10 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
            <p className="mt-2 text-xl font-black">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/payments" : `/admin/payments?status=${f.key}`}
            className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
              status === f.key ? "border-lime-400 bg-lime-400 text-black" : "border-white/20 hover:border-white"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={search}
            placeholder={at("pay.searchPlaceholder")}
            className="w-48 border border-white/20 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-lime-400"
          />
          <button className="border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest">
            Find
          </button>
        </form>
      </div>

      {orders.length === 0 ? (
        <p className="mt-10 text-sm text-neutral-500">{at("pay.noPayments")}</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {orders.map((order) => {
            // Partially refunded orders can still take another refund.
            const refundable = ["paid", "partially_refunded"].includes(order.paymentStatus)
              ? order.total - (order.refundAmount ?? 0)
              : 0;
            return (
              <li key={order.id} className="border border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/orders/${order.id}`} className="font-mono text-sm hover:text-lime-400">
                      {order.id}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      {order.email} · {order.paymentProvider ?? "manual"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{money(order.total)}</span>
                    {(order.refundAmount ?? 0) > 0 && (
                      <span className="text-[11px] text-amber-400">
                        −{money(order.refundAmount)} refunded
                      </span>
                    )}
                    <span className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest ${badge(order.paymentStatus)}`}>
                      {order.paymentStatus.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {editable && refundable > 0 && (
                  <form action={refundOrderAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
                    <input type="hidden" name="id" value={order.id} />
                    <input type="hidden" name="backTo" value="/admin/payments" />
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        {at("pay.refundMax", { max: money(refundable) })}
                      </label>
                      <input
                        name="amount"
                        defaultValue={(refundable / 100).toFixed(2)}
                        className="w-28 border border-white/20 bg-transparent px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="min-w-40 flex-1">
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        Reason (optional)
                      </label>
                      <input
                        name="reason"
                        placeholder={at("ord.refundReasonPlaceholder")}
                        className="w-full border border-white/20 bg-transparent px-2 py-1.5 text-sm"
                      />
                    </div>
                    <button className="border border-white/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-black">
                      {at("ord.refund")}
                    </button>
                  </form>
                )}
                {(order.refundReason || order.refundedByAdminEmail) && (
                  <p className="mt-2 text-[10px] text-neutral-600">
                    {order.refundReason ? `Reason: ${order.refundReason} · ` : ""}
                    {order.refundedByAdminEmail ? `by ${order.refundedByAdminEmail}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-10 text-xs font-black uppercase tracking-widest text-neutral-400">{at("pay.recentEvents")}</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">{at("pay.noEvents")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/10 text-xs">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-mono text-neutral-300">{e.orderId}</span>
              <span className="text-neutral-400">{e.type}</span>
              <span>{money(e.amount)}</span>
              <span className="text-neutral-600">{e.actor ?? "—"}</span>
              <span className="text-neutral-600">{e.createdAt.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
