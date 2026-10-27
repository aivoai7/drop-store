import { prisma } from "./db";
import { countryCode } from "./countries";

export type ShippingOption = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  freeOver: number | null;
};

function countryList(raw: string | null): string[] | null {
  if (!raw) return null;
  const list = JSON.parse(raw) as string[];
  return list.length > 0 ? list.map((c) => c.toUpperCase()) : null;
}

/**
 * Returns the methods that apply to this destination and subtotal, cheapest
 * first. The free-shipping threshold can come from either the global setting or
 * a per-method override.
 */
export async function shippingOptions(input: {
  country: string;
  subtotal: number;
  globalFreeOver: number;
}): Promise<ShippingOption[]> {
  const rows = await prisma.shippingMethod.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { price: "asc" }],
  });
  const country = countryCode(input.country);

  const eligible = rows.filter((r) => {
    const countries = countryList(r.countries);
    if (countries && !countries.includes(country)) return false;
    return input.subtotal >= r.minSubtotal;
  });

  if (eligible.length === 0) {
    // Never leave the customer with an unshippable cart.
    return [
      {
        id: "standard",
        name: "Standard shipping",
        description: "5–8 business days",
        price: input.subtotal >= input.globalFreeOver ? 0 : 1200,
        freeOver: null,
      },
    ];
  }

  // Only the cheapest tier inherits the store-wide free-shipping threshold.
  // Express and next-day keep their own price unless they set an explicit
  // freeOver of their own — otherwise every method turns free at $150.
  const cheapest = eligible.reduce((min, r) => (r.price < min.price ? r : min), eligible[0]);

  return eligible
    .map((r): ShippingOption => {
      const inheritsThreshold = r.id === cheapest.id && r.freeOver === null;
      const threshold = inheritsThreshold ? input.globalFreeOver : r.freeOver;
      const free = threshold !== null && threshold > 0 && input.subtotal >= threshold;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        price: free ? 0 : r.price,
        freeOver: r.freeOver,
      };
    })
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

export async function pickShippingMethod(input: {
  methodId?: string | null;
  country: string;
  subtotal: number;
  globalFreeOver: number;
}) {
  const options = await shippingOptions(input);
  if (!input.methodId) return options[0];
  return options.find((o) => o.id === input.methodId) ?? options[0];
}
