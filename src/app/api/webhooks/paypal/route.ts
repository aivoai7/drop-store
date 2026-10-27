import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { paypalGateway } from "@/lib/gateways/paypal-gateway";
import { applyGatewayEvent } from "@/lib/gateways/apply";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!paypalGateway.isConfigured()) {
    return NextResponse.json({ error: "PayPal not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const event = await paypalGateway.verifyAndParse(request, rawBody);
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  const parsed = (() => {
    try {
      return JSON.parse(rawBody) as { id?: string; event_type?: string };
    } catch {
      return null;
    }
  })();

  if (parsed?.id) {
    const seen = await prisma.webhookEvent.findUnique({ where: { id: parsed.id } });
    if (seen) return NextResponse.json({ received: true, duplicate: true });
    await prisma.webhookEvent.create({ data: { id: parsed.id, type: parsed.event_type ?? "paypal" } });
  }

  const result = await applyGatewayEvent("paypal", event);
  return NextResponse.json({ received: true, ...result });
}
