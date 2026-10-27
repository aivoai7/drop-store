import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";

/**
 * Payment-gateway credentials live in the database so they can be entered from
 * /admin/integrations instead of requiring an env change + restart. Rows are
 * AES-256-GCM encrypted with a key derived from GATEWAY_ENC_KEY (or APP_SECRET).
 * Environment variables keep working as a fallback and lose to the DB row,
 * so existing deployments behave exactly as before.
 */

export type StripeSecrets = { secretKey: string; webhookSecret?: string };
export type PaypalSecrets = { clientId: string; clientSecret: string; webhookId?: string };

const STRIPE_ID = "stripe";
const PAYPAL_ID = "paypal";

function encryptionKey(): Buffer | null {
  const raw = process.env.GATEWAY_ENC_KEY || process.env.APP_SECRET || "";
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

/** Lets the admin UI warn before saving when no encryption key is set. */
export function encryptionKeyAvailable() {
  return Boolean(process.env.GATEWAY_ENC_KEY || process.env.APP_SECRET);
}

function encrypt(plain: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

function decrypt(payload: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** One-shot env snapshot so hot paths don't re-read process.env (cheap, but stable). */
const envSecrets: GatewaySecretsResult = {
  stripe: process.env.STRIPE_SECRET_KEY
    ? { secretKey: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined, source: "env" }
    : undefined,
  paypal:
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
      ? { clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET, webhookId: process.env.PAYPAL_WEBHOOK_ID || undefined, source: "env" }
      : undefined,
};

/** Small TTL cache: webhook and checkout paths hit this on every request. */
let cache: { value: GatewaySecretsResult; at: number } | null = null;
const CACHE_MS = 30_000;

export function invalidateGatewayCache() {
  cache = null;
}

export type SecretSource = "db" | "env";

export type GatewaySecretsResult = {
  stripe?: StripeSecrets & { source: SecretSource };
  paypal?: PaypalSecrets & { source: SecretSource };
};

export async function getGatewaySecrets(): Promise<GatewaySecretsResult> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const value: GatewaySecretsResult = {};
  if (envSecrets.stripe) value.stripe = { ...envSecrets.stripe, source: "env" };
  if (envSecrets.paypal) value.paypal = { ...envSecrets.paypal, source: "env" };

  try {
    const rows = await prisma.gatewayConfig.findMany();
    for (const row of rows) {
      const plain = decrypt(row.secrets);
      if (!plain) continue; // wrong/missing encryption key — leave env fallback in place
      try {
        const parsed = JSON.parse(plain) as Partial<StripeSecrets & PaypalSecrets>;
        if (row.id === STRIPE_ID && parsed.secretKey) {
          value.stripe = { secretKey: parsed.secretKey, webhookSecret: parsed.webhookSecret, source: "db" };
        } else if (row.id === PAYPAL_ID && parsed.clientId && parsed.clientSecret) {
          value.paypal = {
            clientId: parsed.clientId,
            clientSecret: parsed.clientSecret,
            webhookId: parsed.webhookId,
            source: "db",
          };
        }
      } catch {
        /* corrupt row — ignore, env fallback applies */
      }
    }
  } catch {
    /* DB unavailable — env fallback applies */
  }

  cache = { value, at: Date.now() };
  return value;
}

export async function saveGatewaySecrets(id: "stripe" | "paypal", secrets: Record<string, string>) {
  const payload = encrypt(JSON.stringify(secrets));
  if (!payload) {
    return { ok: false as const, error: "未设置 GATEWAY_ENC_KEY 或 APP_SECRET，无法加密保存密钥。" };
  }
  await prisma.gatewayConfig.upsert({
    where: { id },
    create: { id, secrets: payload },
    update: { secrets: payload },
  });
  invalidateGatewayCache();
  return { ok: true as const };
}

export async function deleteGatewaySecrets(id: "stripe" | "paypal") {
  await prisma.gatewayConfig.deleteMany({ where: { id } });
  invalidateGatewayCache();
}

/** Which gateway rows exist in the DB (used to show "managed in admin" in UI). */
export async function managedGatewayIds(): Promise<string[]> {
  const rows = await prisma.gatewayConfig.findMany({ select: { id: true } });
  return rows.map((r) => r.id);
}
