import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { translator, type Locale } from "@/i18n";
import { isLocale } from "@/i18n/config";

export const metadata = { title: "Create account — DROP" };

export default async function SignupPage({
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
      <h1 className="text-3xl font-black uppercase tracking-tight">{t("auth.signUpTitle")}</h1>
      <p className="mt-2 text-sm text-neutral-400">{t("auth.signUpSubtitle")}</p>
      <AuthForm mode="signup" next={next} locale={locale as Locale} />
      <p className="mt-6 text-sm text-neutral-400">
        {t("auth.haveAccount")}{" "}
        <Link href={`/${locale}/login${nextParam}`} className="text-lime-400">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}
