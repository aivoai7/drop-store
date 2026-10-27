import Link from "next/link";
import { notFound } from "next/navigation";
import { findValidResetToken } from "@/lib/password-reset";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export const metadata = { title: "Set a new password — DROP" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale as Locale);

  const { token } = await searchParams;
  const record = token ? await findValidResetToken(token) : null;

  if (!token || !record) {
    return (
      <div className="mx-auto max-w-sm px-4 py-20">
        <h1 className="text-3xl font-black uppercase tracking-tight">{t("reset.expiredTitle")}</h1>
        <p className="mt-3 text-sm text-neutral-400">{t("reset.expiredBody")}</p>
        <Link
          href={`/${locale}/forgot-password`}
          className="mt-6 inline-block bg-lime-400 px-6 py-3 text-sm font-black uppercase tracking-widest text-black"
        >
          {t("reset.requestNew")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-3xl font-black uppercase tracking-tight">{t("reset.title")}</h1>
      <p className="mt-2 text-sm text-neutral-400">{t("reset.for", { email: record.user.email })}</p>
      <ResetPasswordForm token={token} locale={locale as Locale} />
    </div>
  );
}
