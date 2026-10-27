import { NextResponse } from "next/server";
import { LICENSE_SERVER_URL, enforcementEnabled } from "@/lib/license/config";

export const dynamic = "force-dynamic";

/**
 * Bridge to the licence server's self-serve Stripe checkout.
 * POST starts a session and returns { url, sessionId } for the client to open;
 * GET polls whether payment completed and a key was issued. The key itself is
 * then activated through the normal activation server action, which re-verifies
 * it against the licence server — so a forged poll response buys nothing.
 */
export async function POST() {
  if (!enforcementEnabled) {
    return NextResponse.json({ error: "Licence enforcement is not enabled" }, { status: 400 });
  }
  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/v1/checkout`, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: "授权服务器不可达" }, { status: 502 });
  }
}

export async function GET(request: Request) {
  if (!enforcementEnabled) {
    return NextResponse.json({ error: "Licence enforcement is not enabled" }, { status: 400 });
  }
  const session = new URL(request.url).searchParams.get("session");
  if (!session || !/^cs_[a-zA-Z0-9_]+$/.test(session)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/v1/purchase/${encodeURIComponent(session)}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ status: "unknown" }, { status: 502 });
  }
}
