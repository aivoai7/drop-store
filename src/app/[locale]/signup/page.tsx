import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
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
    <AuthShell
      locale={locale}
      eyebrow="Join DROP"
      title={t("auth.signUpTitle")}
      subtitle={t("auth.signUpSubtitle")}
      footer={
        <p>
          {t("auth.haveAccount")}{" "}
          <Link href={`/${locale}/login${nextParam}`} className="font-bold text-lime-400 hover:underline">
            {t("auth.signIn")} →
          </Link>
        </p>
      }
    >
      <AuthForm mode="signup" next={next} locale={locale as Locale} />
    </AuthShell>
  );
}
