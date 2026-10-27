import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export const metadata = { title: "Sign in — DROP" };

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale as Locale);

  const { next } = await searchParams;
  if (await getSessionUser()) redirect(next ?? `/${locale}/account`);

  const nextParam = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-3xl font-black uppercase tracking-tight">{t("auth.signInTitle")}</h1>
      <p className="mt-2 text-sm text-neutral-400">{t("auth.signInSubtitle")}</p>
      <AuthForm mode="signin" next={next} locale={locale as Locale} />
      <p className="mt-4 text-right text-xs">
        <Link href={`/${locale}/forgot-password`} className="text-neutral-400 hover:text-lime-400">
          {t("auth.forgot")}
        </Link>
      </p>
      <p className="mt-6 text-sm text-neutral-400">
        {t("auth.noAccount")}{" "}
        <Link href={`/${locale}/signup${nextParam}`} className="text-lime-400">
          {t("auth.createOne")}
        </Link>
      </p>
    </div>
  );
}
