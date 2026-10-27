/** Absolute site URL, needed for Stripe redirects and email links. */
export function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3002";
}

export function absolute(path: string) {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
