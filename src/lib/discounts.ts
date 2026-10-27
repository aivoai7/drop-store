import { prisma } from "./db";
import { totalsFor } from "./money";

export type DiscountResult =
  | { ok: true; discount: { id: string; code: string; type: string; value: number }; amount: number; subtotal: number; shipping: number; total: number }
  | { ok: false; error: string };

/** Case-insensitive code lookup with every validity rule in one place. */
export async function validateDiscount(
  rawCode: string,
  input: { subtotal: number; email?: string },
): Promise<DiscountResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a code" };

  const discount = await prisma.discount.findUnique({ where: { code } });
  if (!discount || !discount.active) return { ok: false, error: "That code isn't valid" };

  const now = new Date();
  if (discount.startsAt && discount.startsAt > now) return { ok: false, error: "That code isn't active yet" };
  if (discount.endsAt && discount.endsAt < now) return { ok: false, error: "That code has expired" };
  if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit) {
    return { ok: false, error: "That code has been fully redeemed" };
  }
  if (input.subtotal < discount.minSubtotal) {
    return { ok: false, error: `Spend at least $${Math.round(discount.minSubtotal / 100)} to use this code` };
  }
  if (input.email) {
    const used = await prisma.discountRedemption.findFirst({
      where: { discountId: discount.id, email: input.email.toLowerCase() },
    });
    if (used) return { ok: false, error: "You've already used this code" };
  }

  const amount =
    discount.type === "percentage"
      ? Math.round((input.subtotal * Math.min(discount.value, 100)) / 100)
      : Math.min(discount.value, input.subtotal);

  const discounted = Math.max(0, input.subtotal - amount);
  const { shipping, total } = totalsFor([{ price: discounted, quantity: 1 }]);

  return {
    ok: true,
    discount: { id: discount.id, code: discount.code, type: discount.type, value: discount.value },
    amount,
    subtotal: discounted,
    shipping,
    total,
  };
}

export async function recordRedemption(input: {
  discountId: string;
  orderId: string;
  email: string;
  amount: number;
}) {
  await prisma.discountRedemption.create({
    data: {
      discountId: input.discountId,
      orderId: input.orderId,
      email: input.email.toLowerCase(),
      amount: input.amount,
    },
  });
  await prisma.discount.update({
    where: { id: input.discountId },
    data: { usedCount: { increment: 1 } },
  });
}
