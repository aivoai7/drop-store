import { prisma } from "./db";

export const DEFAULT_SETTINGS = {
  id: "default",
  baseCurrency: "usd",
  taxEnabled: false,
  taxBasis: "shipping",
  taxShipping: false,
  fallbackTaxRate: 0,
  pricesIncludeTax: false,
  freeShippingThreshold: 15000,
  invoicePrefix: "INV",
  invoiceNextNumber: 1001,
  invoiceShowTaxId: true,
};

export type Settings = typeof DEFAULT_SETTINGS;

/** Settings are a singleton row; create it on first read so the admin always has something to edit. */
export async function getSettings(): Promise<Settings> {
  const row = await prisma.storeSettings.findUnique({ where: { id: "default" } });
  if (row) return { ...row, updatedAt: undefined } as unknown as Settings;
  const created = await prisma.storeSettings.create({ data: { id: "default" } });
  return { ...created, updatedAt: undefined } as unknown as Settings;
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>) {
  await prisma.storeSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...patch },
    update: patch,
  });
}
