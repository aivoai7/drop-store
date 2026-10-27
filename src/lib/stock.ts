import { prisma } from "./db";
import { refreshProductStock } from "./variants";

/**
 * Stock only moves on real state changes: paid → reserve, cancelled → restore.
 * Guarded by Order.stockRestored so a retry can't double-restore.
 */
export async function restoreOrderStock(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.stockRestored) return false;

  for (const item of order.items) {
    if (item.variantId) {
      await prisma.variant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      });
      await refreshProductStock(item.productId);
    }
  }
  await prisma.order.update({ where: { id: orderId }, data: { stockRestored: true } });
  return true;
}

export async function reserveOrderStock(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return;

  for (const item of order.items) {
    if (item.variantId) {
      await prisma.variant.update({
        where: { id: item.variantId },
        data: { stock: { decrement: item.quantity } },
      });
      await refreshProductStock(item.productId);
    }
  }
}

/** True when every line can be fulfilled from current variant stock. */
export async function checkAvailability(
  lines: Array<{ variantId: string; quantity: number }>,
) {
  const variants = await prisma.variant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
  });
  const short = lines.filter((line) => {
    const variant = variants.find((v) => v.id === line.variantId);
    return !variant || variant.stock < line.quantity;
  });
  return { ok: short.length === 0, short };
}
