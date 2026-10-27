import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { q = "" } = await searchParams;
  const search = q.trim();

  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      orders: { select: { total: true, paymentStatus: true } },
      _count: { select: { orders: true } },
    },
  });

  const guests = await prisma.order.count({ where: { userId: null } });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("cust.title")}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {at("cust.accounts", { count: users.length, guests })}
          </p>
        </div>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={search}
            placeholder={at("cust.searchPlaceholder")}
            className="w-48 border border-white/20 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-lime-400"
          />
          <button className="border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest">
            Find
          </button>
        </form>
      </div>

      {users.length === 0 ? (
        <p className="mt-10 text-sm text-neutral-500">{at("cust.noAccounts")}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
              <tr>
                <th className="py-2 pr-3">{at("c.name")}</th>
                <th className="py-2 pr-3">{at("c.email")}</th>
                <th className="py-2 pr-3">{at("cust.orders")}</th>
                <th className="py-2 pr-3">{at("cust.spent")}</th>
                <th className="py-2 pr-3">{at("c.status")}</th>
                <th className="py-2">{at("cust.joined")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {users.map((u) => {
                const spent = u.orders
                  .filter((o) => o.paymentStatus === "paid")
                  .reduce((n, o) => n + o.total, 0);
                return (
                  <tr key={u.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/customers/${u.id}`} className="font-bold hover:text-lime-400">
                        {u.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-xs text-neutral-400">{u.email}</td>
                    <td className="py-2 pr-3">{u._count.orders}</td>
                    <td className="py-2 pr-3">{money(spent)}</td>
                    <td className="py-2 pr-3">
                      {u.disabled ? (
                        <span className="bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                          {at("c.disabled")}
                        </span>
                      ) : (
                        <span className="bg-lime-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lime-400">
                          {at("c.active")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-neutral-500">{u.createdAt.toLocaleDateString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
