import { NextResponse } from "next/server";
import { z } from "zod";
import { validateDiscount } from "@/lib/discounts";
import { rateLimit, formatRetry } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { getSessionUser } from "@/lib/auth";

const schema = z.object({
  code: z.string().min(1).max(40),
  subtotal: z.number().int().min(0),
});

export async function POST(request: Request) {
  const ip = await clientIp();
  const limit = await rateLimit(`discount:${ip}`, 20, 10 * 60);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${formatRetry(limit.retryAfterSeconds)}.` },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
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
