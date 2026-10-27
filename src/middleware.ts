import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, matchLocale, locales } from "@/i18n/config";

const LICENSE_COOKIE = "DROP_LICENSE_OK";

/**
 * Two jobs, in order:
 *   1. Lock the whole site when there is no valid licence.
 *   2. Put every storefront URL under its locale prefix.
 *
 * The licence check reads a short-lived cookie set by /api/license/status, so
 * the middleware never blocks on the licence server itself.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isStatic =
    pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/static");
  if (isStatic) return NextResponse.next();

  const licenceExempt =
    pathname === "/license" ||
    pathname.startsWith("/api/license") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron");
  if (licenceExempt) return NextResponse.next();

  // Enforcement is off unless the deployment declares a licence server.
  const enforcing = Boolean(process.env.LICENSE_SERVER_URL);

  if (enforcing && request.cookies.get(LICENSE_COOKIE)?.value !== "1") {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Licence required" }, { status: 402 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/license";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/license")
  ) {
    return NextResponse.next();
  }

  const first = pathname.split("/")[1];
  if (isLocale(first)) return NextResponse.next();

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale =
    cookieLocale && isLocale(cookieLocale)
      ? cookieLocale
      : matchLocale(request.headers.get("accept-language")) ?? defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export { locales };
