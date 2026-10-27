import { NextResponse } from "next/server";
import { runCleanup } from "@/lib/cron";
import { refreshExchangeRates, exchangeRatesConfigured } from "@/lib/exchange-rates";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const url = new URL(request.url);
  const token = header ?? url.searchParams.get("token");

  if (!verifyCronSecret(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCleanup();

  // Exchange rates refresh on the same schedule; skipped when no provider is set.
  const rates = exchangeRatesConfigured()
    ? await refreshExchangeRates()
    : { ok: false, provider: "manual", updated: [], skipped: [], error: "not configured" };

  return NextResponse.json({ ok: true, ...result, exchangeRates: rates });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
