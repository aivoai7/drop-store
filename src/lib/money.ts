import { money } from "./format";

export const FREE_SHIPPING_THRESHOLD = 15000;
export const SHIPPING_FEE = 1200;

export function shippingFor(subtotal: number) {
  return subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

export function totalsFor(items: Array<{ price: number; quantity: number }>) {
  const subtotal = items.reduce((n, i) => n + i.price * i.quantity, 0);
  const shipping = shippingFor(subtotal);
  return { subtotal, shipping, total: subtotal + shipping };
}

export { money };
