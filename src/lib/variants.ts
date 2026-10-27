import { prisma } from "./db";

export type VariantInput = { color: string; size: string; stock: number; price: number | null; sku?: string };

export function defaultSku(slug: string, color: string, size: string) {
  const part = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 6) || "X";
  return `${slug.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10)}-${part(color)}-${part(size)}`;
}

/** Rebuilds the variant set for a product and refreshes the cached stock total. */
export async function syncVariants(productId: string, inputs: VariantInput[]) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Product not found");

  const keep = new Set<string>();

  for (const input of inputs) {
    const existing = await prisma.variant.findUnique({
      where: { productId_color_size: { productId, color: input.color, size: input.size } },
    });
    const sku = input.sku?.trim() || existing?.sku || defaultSku(product.slug, input.color, input.size);

    const variant = existing
      ? await prisma.variant.update({
          where: { id: existing.id },
          data: { stock: input.stock, price: input.price, sku },
        })
      : await prisma.variant.create({
          data: { productId, color: input.color, size: input.size, stock: input.stock, price: input.price, sku },
        });
    keep.add(variant.id);
  }

  // Combinations removed from the option lists go away, unless an order referenced them.
  const stale = await prisma.variant.findMany({ where: { productId, id: { notIn: [...keep] } } });
  for (const variant of stale) {
    const used = await prisma.orderItem.count({ where: { variantId: variant.id } });
    if (used === 0) await prisma.variant.delete({ where: { id: variant.id } });
  }

  await refreshProductStock(productId);
}

export async function refreshProductStock(productId: string) {
  const total = await prisma.variant.aggregate({
    where: { productId },
    _sum: { stock: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: { stock: total._sum.stock ?? 0 },
  });
}

export function variantsForOptions(colors: string[], sizes: string[]) {
  return colors.flatMap((color) => sizes.map((size) => ({ color, size })));
}

export async function variantStockMap(productId: string) {
  const variants = await prisma.variant.findMany({ where: { productId } });
  const map: Record<string, number> = {};
  for (const v of variants) map[`${v.color}|${v.size}`] = v.stock;
  return map;
}
