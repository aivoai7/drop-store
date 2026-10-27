import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { CheckoutForm } from "./CheckoutForm";
import type { Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await getSessionUser();
  return <CheckoutForm user={user} locale={locale as Locale} />;
}
