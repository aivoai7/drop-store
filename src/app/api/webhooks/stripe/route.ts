import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripeGateway } from "@/lib/gateways/stripe-gateway";
import { applyGatewayEvent } from "@/lib/gateways/apply";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook. Verification and payload parsing live in the gateway adapter;
 * the state transitions are shared with the PayPal endpoint.
 */
export async function POST(request: Request) {
  if (!stripeGateway.isConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const event = await stripeGateway.verifyAndParse(request, rawBody);
  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Stripe retries; the event id makes state changes idempotent.
  const eventId =
    (() => {
      try {
        return (JSON.parse(rawBody) as { id?: string }).id ?? null;
      } catch {
        return null;
      }
    })() ?? null;

  if (eventId) {
    const seen = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
    if (seen) return NextResponse.json({ received: true, duplicate: true });
  }

  const result = await applyGatewayEvent("stripe", event);

  if (eventId) {
    await prisma.webhookEvent.create({ data: { id: eventId, type: event.type } }).catch(() => {});
  }

  return NextResponse.json({ received: true, ...result });
}
