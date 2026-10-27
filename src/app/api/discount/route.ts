import { NextResponse } from "next/server";
import { forwardToGo } from "@/lib/go-api";
import { z } from "zod";
import { validateDiscount } from "@/lib/discounts";
import { rateLimit, formatRetry } from "@/lib/rate-limit";
import { clientIp, clientIpFrom } from "@/lib/request";
import { getSessionUser } from "@/lib/auth";

const schema = z.object({
  code: z.string().min(1).max(40),
  subtotal: z.number().int().min(0),
});

export async function POST(request: Request) {
  const raw = await request.text();

  // Delegate to the Go service when it is configured; it applies the same
  // rate limit itself, so counting here too would halve everyone's budget.
  const proxied = await forwardToGo("/v1/discount", { body: raw, ip: clientIpFrom(request) });
  if (proxied) return NextResponse.json(proxied.body, { status: proxied.status });

  const ip = await clientIp();
  const limit = await rateLimit(`discount:${ip}`, 20, 10 * 60);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${formatRetry(limit.retryAfterSeconds)}.` },
      { status: 429 },
    );
  }

  // Malformed JSON must be a 400, not an unhandled 500.
  let parsedJson: unknown = null;
  try {
    parsedJson = JSON.parse(raw || "null");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const user = await getSessionUser();
  const result = await validateDiscount(parsed.data.code, {
    subtotal: parsed.data.subtotal,
    email: user?.email,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({
    code: result.discount.code,
    amount: result.amount,
    total: result.total,
    shipping: result.shipping,
  });
}
