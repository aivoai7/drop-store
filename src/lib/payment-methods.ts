import { prisma } from "./db";

export type MethodRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  automated: boolean;
  instructions: string | null;
};

export const METHOD_CATALOG = [
  { code: "card", name: "Credit / debit card", automated: true, description: "Visa, Mastercard, Amex" },
  { code: "apple_pay", name: "Apple Pay", automated: true, description: "One-tap on supported devices" },
  { code: "google_pay", name: "Google Pay", automated: true, description: "One-tap on Android" },
  { code: "paypal", name: "PayPal", automated: false, description: "Redirects to PayPal" },
  { code: "bank_transfer", name: "Bank transfer", automated: false, description: "Order ships after funds clear" },
  { code: "cod", name: "Cash on delivery", automated: false, description: "Pay the courier on arrival" },
] as const;

export async function getEnabledMethods(): Promise<MethodRow[]> {
  return prisma.paymentMethod.findMany({
    where: { enabled: true },
    orderBy: { position: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      enabled: true,
      automated: true,
      instructions: true,
    },
  });
}

export async function getMethod(code: string) {
  return prisma.paymentMethod.findUnique({ where: { code } });
}

export function catalogEntry(code: string) {
  return METHOD_CATALOG.find((m) => m.code === code);
}
