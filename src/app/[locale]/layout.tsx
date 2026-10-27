import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { Footer } from "@/components/Footer";
import { getSessionUser } from "@/lib/auth";
import { isLocale, localeMeta, locales, type Locale } from "@/i18n/config";
import { getDisplayCurrency } from "@/lib/display-currency";
import { prisma } from "@/lib/db";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const user = await getSessionUser();
  const [displayCurrency, currencies] = await Promise.all([
    getDisplayCurrency(locale as Locale),
    prisma.currency.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
      select: { code: true, name: true, symbol: true },
    }),
  ]);

  return (
    <div lang={localeMeta[locale].htmlLang} className="flex min-h-full flex-col">
      <CurrencyProvider currency={displayCurrency}>
      <Header
        user={user}
        locale={locale as Locale}
        currency={displayCurrency.code}
        currencies={currencies}
      />
      <main className="flex-1">{children}</main>
      <Footer locale={locale as Locale} />
      </CurrencyProvider>
    </div>
  );
}
