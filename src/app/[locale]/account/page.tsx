import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { priceIn, type DisplayCurrency } from "@/lib/display-currency";
import { signOut } from "@/lib/customer-actions";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale as Locale);

  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/account`);

  const orderCurrencies = await prisma.currency.findMany();
  const formatFor = (order: { currency: string; fxRate: number }, amountMinor: number) => {
    const row = orderCurrencies.find((c) => c.code === order.currency);
    const display: DisplayCurrency = row
      ? { code: row.code, name: row.name, symbol: row.symbol, rate: row.rate, decimals: row.decimals }
      : { code: "usd", name: "US Dollar", symbol: "$", rate: 1, decimals: 2 };
    // The order stored its own fxRate; re-render at that rate, not today's.
    return priceIn(amountMinor, { ...display, rate: order.fxRate || 1 });
  };

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight">{t("account.title")}</h1>
          <p className="mt-2 text-sm text-neutral-400">
            {t("account.signedInAs", { name: user.name, email: user.email })}
          </p>
        </div>
        <form action={signOut}>
          <button className="border border-white/30 px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black">
            {t("account.signOut")}
          </button>
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="border border-white/10 py-16 text-center">
          <p className="text-neutral-400">{t("account.noOrders")}</p>
          <Link
            href={`/${locale}/shop`}
            className="mt-6 inline-block bg-lime-400 px-8 py-3 text-sm font-black uppercase tracking-widest text-black"
          >
            {t("account.shopCta")}
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="border border-white/10 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm">{order.id}</span>
                <span className="text-xs font-bold uppercase tracking-widest text-lime-400">
                  {order.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {order.createdAt.toLocaleDateString(locale, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {order.city}, {order.country}
              </p>
              <ul className="mt-4 space-y-1 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.name}{" "}
                      <span className="text-neutral-500">
                        {item.color} / {item.size} ×{item.quantity}
                      </span>
                    </span>
                    <span>{formatFor(order, item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-white/10 pt-3 text-right font-bold">
                {formatFor(order, order.total)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
