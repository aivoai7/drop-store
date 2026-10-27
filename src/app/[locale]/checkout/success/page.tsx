import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { priceIn, type DisplayCurrency } from "@/lib/display-currency";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ order?: string; session_id?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale as Locale);

  const { order: orderId } = await searchParams;
  const order = orderId
    ? await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } })
    : null;
  const user = await getSessionUser();

  // Order IDs are enumerable (DRP-<timestamp>), so amounts and status only go
  // to the owner. Anyone else with the URL gets a generic confirmation.
  const ownsOrder = Boolean(order && user && order.userId === user.id);

  if (!order || !ownsOrder) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-xs font-black tracking-[0.4em] text-lime-400">
          {t("success.processing")}
        </p>
        <h1 className="mt-3 text-4xl font-black uppercase">{t("success.titleConfirmed")}</h1>
        <p className="mt-4 text-neutral-300">
          {t("success.descPending", { id: orderId ?? "" })}
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          订单详情请查看确认邮件，或登录后访问「我的订单」。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {user ? (
            <Link
              href={`/${locale}/account`}
              className="bg-lime-400 px-8 py-3 text-sm font-black uppercase tracking-widest text-black"
            >
              {t("success.viewOrders")}
            </Link>
          ) : (
            <Link
              href={`/${locale}/signup?next=/${locale}/account`}
              className="bg-lime-400 px-8 py-3 text-sm font-black uppercase tracking-widest text-black"
            >
              {t("success.createAccount")}
            </Link>
          )}
          <Link
            href={`/${locale}/shop`}
            className="border border-white/30 px-8 py-3 text-sm font-black uppercase tracking-widest hover:bg-white hover:text-black"
          >
            {t("success.keepShopping")}
          </Link>
        </div>
      </div>
    );
  }

  const currencyRow = await prisma.currency.findUnique({ where: { code: order.currency } });
  const display: DisplayCurrency = currencyRow
    ? {
        code: currencyRow.code,
        name: currencyRow.name,
        symbol: currencyRow.symbol,
        rate: order.fxRate || 1,
        decimals: currencyRow.decimals,
      }
    : { code: "usd", name: "US Dollar", symbol: "$", rate: 1, decimals: 2 };
  const confirmed = order.paymentStatus === "paid";
  const itemLabel =
    order.items.length === 1
      ? t("success.items", { count: order.items.length })
      : t("success.itemsPlural", { count: order.items.length });

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-xs font-black tracking-[0.4em] text-lime-400">
        {confirmed ? t("success.confirmed") : t("success.processing")}
      </p>
      <h1 className="mt-3 text-4xl font-black uppercase">
        {confirmed ? t("success.titleConfirmed") : t("success.titlePending")}
      </h1>
      <p className="mt-4 text-neutral-300">
        {confirmed
          ? t("success.descConfirmed", { id: order.id })
          : t("success.descPending", { id: order.id })}
      </p>
      <p className="mt-2 text-sm text-neutral-400">
        {itemLabel} · {priceIn(order.total, display)}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {user ? (
          <Link
            href={`/${locale}/account`}
            className="bg-lime-400 px-8 py-3 text-sm font-black uppercase tracking-widest text-black"
          >
            {t("success.viewOrders")}
          </Link>
        ) : (
          <Link
            href={`/${locale}/signup?next=/${locale}/account`}
            className="bg-lime-400 px-8 py-3 text-sm font-black uppercase tracking-widest text-black"
          >
            {t("success.createAccount")}
          </Link>
        )}
        <Link
          href={`/${locale}/shop`}
          className="border border-white/30 px-8 py-3 text-sm font-black uppercase tracking-widest hover:bg-white hover:text-black"
        >
          {t("success.keepShopping")}
        </Link>
      </div>
      {!confirmed && <meta httpEquiv="refresh" content="3" />}
    </div>
  );
}
