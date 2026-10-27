import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, matchLocale, locales } from "@/i18n/config";

/**
 * Every storefront URL carries its locale (`/en/shop`). The admin, API routes,
 * and static assets are never localised — the admin is Chinese-only by design.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Already localised?
  const first = pathname.split("/")[1];
  if (isLocale(first)) return NextResponse.next();

  // Remember the visitor's choice, else negotiate from Accept-Language.
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|admin).*)"],
};

export { locales };
