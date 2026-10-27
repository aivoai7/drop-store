import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { canEdit } from "@/lib/permissions";
import {
  markPaidAction,
  refundOrderAction,
  shipOrder,
  syncPaymentAction,
  updateOrderDetails,
  updateOrderStatus,
} from "@/lib/order-actions";
import { at as copy } from "@/lib/admin-copy/zh";
import { ADMIN_BASE, adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-400";
const label = "block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; refunded?: string; paid?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));

  const { id } = await params;
  const { error, refunded, paid } = await searchParams;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, user: { select: { id: true, email: true, name: true } } },
  });
  if (!order) notFound();

  const editable = canEdit(admin.role);
  const backTo = `${ADMIN_BASE}/orders/${order.id}`;
  const subtotal = order.subtotal || order.items.reduce((n, i) => n + i.price * i.quantity, 0);

  const timeline = [
    { label: copy("ord.placed"), at: order.createdAt as Date | null },
    { label: copy("ord.shipped"), at: order.shippedAt },
    { label: copy("ord.cancelled"), at: order.cancelledAt },
    { label: copy("ord.refunded"), at: order.refundedAt },
  ].filter((e): e is { label: string; at: Date } => e.at !== null);

  return (
    <div>
      <Link href={adminPath("/orders")} className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white">
        ← {copy("ord.title")}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-black sm:text-2xl">{order.id}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {order.createdAt.toLocaleString("en-US")} · {order.items.length} item
            {order.items.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-white/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest">
            {order.status}
          </span>
          <a
            href={`${ADMIN_BASE}/orders/${order.id}/invoice`}
            target="_blank"
            rel="noreferrer"
            className="border border-white/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-white"
          >
            {copy("ord.invoice")}
          </a>
          <span
            className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
              order.paymentStatus === "paid"
                ? "bg-lime-400 text-black"
                : order.paymentStatus === "partially_refunded"
                  ? "bg-amber-400 text-black"
                  : order.paymentStatus === "refunded"
                    ? "bg-neutral-700"
                  : order.paymentStatus === "failed"
                    ? "bg-red-500"
                    : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {order.paymentStatus}
          </span>
        </div>
      </div>

      {error && (
        <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error === "tracking-required"
            ? copy("ord.trackingRequired")
            : error === "missing-fields"
              ? copy("ord.missingFields")
              : error}
        </p>
      )}
      {refunded && (
        <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">
          {copy("ord.refundIssued")}
        </p>
      )}
      {paid && (
        <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">
          {copy("ord.paymentRecorded")}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="border border-white/10 p-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{copy("ord.items")}</h2>
            <table className="mt-3 w-full text-left text-sm">
              <tbody className="divide-y divide-white/10">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-3">
                      <Link href={`${ADMIN_BASE}/products/${item.productId}`} className="hover:text-lime-400">
                        {item.name}
                      </Link>
                      <p className="text-[11px] text-neutral-500">
                        {item.sku ? `${item.sku} · ` : ""}
                        {item.color} / {item.size}
                      </p>
                    </td>
                    <td className="py-2 pr-3 text-xs text-neutral-400">×{item.quantity}</td>
                    <td className="py-2 text-right font-bold">{money(item.price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
              <div className="flex justify-between text-neutral-400">
                <dt>{copy("c.subtotal")}</dt>
                <dd>{money(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-neutral-400">
                <dt>{copy("c.shipping")}</dt>
                <dd>{order.shipping === 0 ? "Free" : money(order.shipping)}</dd>
              </div>
              {order.taxAmount > 0 && (
                <div className="flex justify-between text-neutral-400">
                  <dt>
                    {order.taxLabel ?? "Tax"} ({(order.taxRate / 100).toFixed(2).replace(/\.?0+$/, "")}%)
                  </dt>
                  <dd>{money(order.taxAmount)}</dd>
                </div>
              )}
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-lime-400">
                  <dt>Discount {order.discountCode ? `(${order.discountCode})` : ""}</dt>
                  <dd>−{money(order.discountAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
                <dt>{copy("c.total")}</dt>
                <dd>{money(order.total)}</dd>
              </div>
            </dl>
          </section>

          <section className="border border-white/10 p-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">
              {copy("ord.customerShipping")}
            </h2>
            <div className="mt-3 border-b border-white/10 pb-3 text-xs text-neutral-400">
              <p className="text-neutral-200">{order.name}</p>
              <p>{order.email}</p>
              <p>
                {order.address}, {order.city}, {order.country}
              </p>
              {order.adminNote && (
                <p className="mt-2 text-amber-300/80">Note: {order.adminNote}</p>
              )}
            </div>
            {editable ? (
              <form action={updateOrderDetails} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="backTo" value={backTo} />
                <div>
                  <label className={label}>{copy("ord.name")}</label>
                  <input name="name" defaultValue={order.name} className={field} />
                </div>
                <div>
                  <label className={label}>{copy("ord.readOnlyEmail")}</label>
                  <input value={order.email} readOnly className={`${field} text-neutral-500`} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>{copy("ord.address")}</label>
                  <input name="address" defaultValue={order.address} className={field} />
                </div>
                <div>
                  <label className={label}>{copy("ord.city")}</label>
                  <input name="city" defaultValue={order.city} className={field} />
                </div>
                <div>
                  <label className={label}>{copy("ord.country")}</label>
                  <input name="country" defaultValue={order.country} className={field} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>{copy("ord.internalNote")}</label>
                  <textarea name="adminNote" rows={2} defaultValue={order.adminNote ?? ""} className={field} />
                </div>
                <div className="sm:col-span-2">
                  <button className="bg-lime-400 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black">
                    {copy("ord.saveDetails")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3 text-sm text-neutral-300">
                <p>{order.name}</p>
                <p>{order.email}</p>
                <p>
                  {order.address}, {order.city}, {order.country}
                </p>
                {order.adminNote && <p className="mt-2 text-xs text-neutral-500">Note: {order.adminNote}</p>}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {editable && (
            <>
              <section className="border border-white/10 p-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{copy("ord.fulfilment")}</h2>
                <form action={shipOrder} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={order.id} />
                  <input type="hidden" name="backTo" value={backTo} />
                  <input
                    name="carrier"
                    defaultValue={order.carrier ?? ""}
                    placeholder={copy("ord.carrier")}
                    className={field}
                  />
                  <input
                    name="trackingNumber"
                    defaultValue={order.trackingNumber ?? ""}
                    placeholder={copy("ord.tracking")}
                    className={field}
                  />
                  <button className="w-full bg-white py-2 text-[10px] font-black uppercase tracking-widest text-black">
                    {copy("ord.markShipped")}
                  </button>
                  <p className="text-[10px] text-neutral-600">
                    {copy("ord.shipHint")}
                  </p>
                </form>

                <form action={updateOrderStatus} className="mt-4 flex gap-2 border-t border-white/10 pt-4">
                  <input type="hidden" name="id" value={order.id} />
                  <input type="hidden" name="backTo" value={backTo} />
                  <select
                    name="status"
                    defaultValue={order.status}
                    className="flex-1 border border-white/20 bg-black px-2 py-2 text-[11px] uppercase tracking-wider"
                  >
                    {["pending", "paid", "shipped", "cancelled"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button className="border border-white/30 px-3 py-2 text-[10px] font-bold uppercase tracking-wider">
                    Update
                  </button>
                </form>
                <p className="mt-2 text-[10px] text-neutral-600">
                  {copy("ord.cancelRestoresStock")}
                </p>
              </section>

              <section className="border border-white/10 p-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{copy("ord.payment")}</h2>
                <dl className="mt-2 space-y-1 text-[11px] text-neutral-500">
                  <div className="flex justify-between">
                    <dt>{copy("c.status")}</dt>
                    <dd className="text-neutral-200">{order.paymentStatus}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{copy("ord.provider")}</dt>
                    <dd className="text-neutral-200">{order.paymentProvider ?? "manual"}</dd>
                  </div>
                  {order.refundAmount > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <dt>{copy("ord.refunded")}</dt>
                      <dd>{money(order.refundAmount)}</dd>
                    </div>
                  )}
                  {order.refundReason && (
                    <div className="flex justify-between">
                      <dt>{copy("ord.refundReason")}</dt>
                      <dd className="text-neutral-300">{order.refundReason}</dd>
                    </div>
                  )}
                  {order.stripePaymentIntentId && (
                    <div className="flex justify-between gap-3">
                      <dt>{copy("ord.intent")}</dt>
                      <dd className="break-all font-mono">{order.stripePaymentIntentId}</dd>
                    </div>
                  )}
                </dl>

                {["pending", "failed"].includes(order.paymentStatus) && (
                  <div className="mt-3 space-y-2">
                    <form action={markPaidAction}>
                      <input type="hidden" name="id" value={order.id} />
                      <input type="hidden" name="backTo" value={backTo} />
                      <button className="w-full bg-lime-400 py-2 text-[10px] font-black uppercase tracking-widest text-black">
                        {copy("ord.markPaid")}
                      </button>
                    </form>
                    {order.stripeSessionId && (
                      <form action={syncPaymentAction}>
                        <input type="hidden" name="id" value={order.id} />
                        <input type="hidden" name="backTo" value={backTo} />
                        <button className="w-full border border-white/30 py-2 text-[10px] font-black uppercase tracking-widest">
                          {copy("ord.recheck")}
                        </button>
                      </form>
                    )}
                    <p className="text-[10px] text-neutral-600">
                      {copy("ord.markPaidHint")}
                    </p>
                  </div>
                )}

                {["paid", "partially_refunded"].includes(order.paymentStatus) && order.refundAmount < order.total && (
                  <form action={refundOrderAction} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={order.id} />
                    <input type="hidden" name="backTo" value={backTo} />
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        {copy("ord.refundAmount", { max: money(order.total - order.refundAmount) })}
                      </label>
                      <input
                        name="amount"
                        defaultValue={((order.total - order.refundAmount) / 100).toFixed(2)}
                        className="w-full border border-white/20 bg-transparent px-2 py-1.5 text-sm"
                      />
                    </div>
                    <input
                      name="reason"
                      placeholder={copy("ord.refundReasonPlaceholder")}
                      className="w-full border border-white/20 bg-transparent px-2 py-1.5 text-sm"
                    />
                    <button className="w-full border border-white/30 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-black">
                      {copy("ord.issueRefund")}
                    </button>
                  </form>
                )}
              </section>
            </>
          )}

          {order.trackingNumber && (
            <section className="border border-lime-400/30 bg-lime-400/5 p-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-lime-400">{copy("ord.shippedCard")}</h2>
              <dl className="mt-2 space-y-1 text-xs">
                {order.carrier && (
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Carrier</dt>
                    <dd>{order.carrier}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Tracking</dt>
                  <dd className="break-all font-mono">{order.trackingNumber}</dd>
                </div>
                {order.shippedAt && (
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Shipped</dt>
                    <dd>{order.shippedAt.toLocaleDateString("en-US")}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          <section className="border border-white/10 p-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{copy("ord.timeline")}</h2>
            <ul className="mt-3 space-y-2 text-xs">
              {timeline.map((event) => (
                <li key={event.label} className="flex justify-between gap-3">
                  <span className="text-neutral-300">{event.label}</span>
                  <span className="text-neutral-600">
                    {event.at.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
            {order.user && (
              <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-neutral-500">
                {copy("ord.account")}：{" "}
                <Link href={`${ADMIN_BASE}/customers/${order.user.id}`} className="text-lime-400">
                  {order.user.email}
                </Link>
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
