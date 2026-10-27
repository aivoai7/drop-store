/**
 * Admin route base. Deliberately unlisted: no storefront link points here,
 * and the old /admin path 404s for anyone without an admin session (see
 * middleware), so path probing finds nothing. Override with ADMIN_PATH when
 * deploying — every admin URL (pages, login redirects, sidebar) derives from
 * this constant.
 */
export const ADMIN_BASE = process.env.ADMIN_PATH?.replace(/\/+$/, "") || "/admin-x7k2";

/** Convenience builders used across the admin tree. */
export const adminPath = (sub: string) => `${ADMIN_BASE}${sub}`;
export const ADMIN_LOGIN = `${ADMIN_BASE}/login`;
