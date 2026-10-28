import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, matchLocale, locales } from "@/i18n/config";
import { ADMIN_BASE } from "@/lib/admin-path";

const LICENSE_COOKIE = "DROP_LICENSE_OK";

/**
 * Three jobs, in order:
 *   1. Sinkhole the old /admin path so probing finds nothing.
 *   2. Lock the whole site when there is no valid licence.
 *   3. Put every storefront URL under its locale prefix.
 *
 * The licence check reads a short-lived cookie set by /api/license/status, so
 * the middleware never blocks on the licence server itself.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/uploads/");
  if (isStatic) return NextResponse.next();

  // The admin area moved to ADMIN_BASE (unlisted). Anything hitting the old
  // /admin path gets an empty 404 — no redirect, no hint that it ever existed.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return new NextResponse(null, { status: 404 });
  }

  const licenceExempt =
    pathname === "/license" ||
    pathname.startsWith("/api/license") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron") ||
    // Admin APIs enforce session + role themselves; the storefront licence
    // cookie is irrelevant to them.
    pathname.startsWith("/api/admin") ||
    // The admin area enforces the licence inside its own pages; bouncing the
    // login screen through /license just flickers for signed-in admins.
    pathname.startsWith(ADMIN_BASE);
  if (licenceExempt) return NextResponse.next();

  // Enforcement is off unless the deployment declares a licence server.
  const enforcing = Boolean(process.env.LICENSE_SERVER_URL);

  if (enforcing && request.cookies.get(LICENSE_COOKIE)?.value !== "1") {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Licence required" }, { status: 402 });
    }
    // /license re-checks server-side: a valid licence or an open trial gets
    // the cookie re-issued and the visitor sent on their way.
    const url = request.nextUrl.clone();
    url.pathname = "/license";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (
    pathname.startsWith(ADMIN_BASE) ||
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
