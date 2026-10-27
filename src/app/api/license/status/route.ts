import { NextResponse } from "next/server";
import { getLicense } from "@/lib/license/state";
import { enforcementEnabled } from "@/lib/license/config";

export const dynamic = "force-dynamic";

const COOKIE = "DROP_LICENSE_OK";

/**
 * Verifies the licence and sets the cookie the middleware trusts.
 * Called by the /license page and by clients that need to re-validate.
 */
export async function GET() {
  const view = await getLicense();
  const res = NextResponse.json({
    ok: view.ok,
    status: view.status,
    plan: view.plan,
    domain: view.domain,
    expiresAt: view.expiresAt,
    inGrace: view.inGrace,
    enforcementEnabled: view.enforcementEnabled,
    lastError: view.lastError,
  });

  if (enforcementEnabled) {
    if (view.ok) {
      res.cookies.set(COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        // Short TTL so revocation takes effect quickly.
        maxAge: 60 * 15,
      });
    } else {
      res.cookies.delete(COOKIE);
    }
  } else {
    res.cookies.set(COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 15 });
  }

  return res;
}
