/**
 * Bridge to the Go API service.
 *
 * When GO_API_URL is set, these endpoints are served by Go instead of the
 * Next.js route handlers. Leaving it unset keeps the TypeScript implementation,
 * so the migration can happen one endpoint at a time.
 */
export const GO_API_URL = process.env.GO_API_URL?.replace(/\/$/, "") ?? "";

export const goApiEnabled = GO_API_URL !== "";

export type ProxyResult = {
  status: number;
  body: unknown;
};

/** Forwards a request body to the Go service and returns its response verbatim. */
export async function forwardToGo(
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string>; cookie?: string; ip?: string },
): Promise<ProxyResult | null> {
  if (!GO_API_URL) return null;

  try {
    const res = await fetch(`${GO_API_URL}${path}`, {
      method: init.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        // The Go service rate-limits per IP; without this every proxied request
        // would share the Next server's own bucket.
        ...(init.ip ? { "X-Forwarded-For": init.ip } : {}),
        ...(init.cookie ? { Cookie: init.cookie } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body,
      // Never cache a priced cart.
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    const body = await res.json().catch(() => ({ error: "Invalid response from API service" }));
    return { status: res.status, body };
  } catch (err) {
    console.error(`[go-api] ${path} failed`, err);
    return null;
  }
}
