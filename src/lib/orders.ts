import { prisma } from "./db";
import { sendEmail, emailEnabled } from "./email";
import { orderConfirmationEmail } from "./email-templates";

export const orderInclude = { items: true } as const;

/** Idempotent: only sends once per order because it keys off a status change. */
export async function sendOrderConfirmation(order: {
  id: string;
  email: string;
  name: string;
  total: number;
  items: Array<{ name: string; size: string; color: string; quantity: number; price: number }>;
}) {
  const already = await prisma.emailMessage.findFirst({
    where: { template: "order-confirmation", subject: { contains: order.id } },
  });
  if (already) return;

  const { subject, html } = orderConfirmationEmail({
    name: order.name,
    orderId: order.id,
    total: order.total,
    items: order.items,
  });
  await sendEmail({ to: order.email, subject, html, template: "order-confirmation" });
}

export { emailEnabled };
