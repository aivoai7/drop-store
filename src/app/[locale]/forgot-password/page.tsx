import Link from "next/link";
import { notFound } from "next/navigation";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export const metadata = { title: "Reset password — DROP" };

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale as Locale);

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-3xl font-black uppercase tracking-tight">{t("forgot.title")}</h1>
      <p className="mt-2 text-sm text-neutral-400">{t("forgot.subtitle")}</p>
      <ForgotPasswordForm locale={locale as Locale} />
      <p className="mt-6 text-sm text-neutral-400">
        <Link href={`/${locale}/login`} className="text-lime-400">
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </div>
  );
}
