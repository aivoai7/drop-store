#!/usr/bin/env node
/**
 * Minimal licence server.
 *
 *   POST /v1/verify   { key, domain, fingerprint, product }
 *        -> { valid, plan, domain, expiresAt, seats, error? }
 *   POST /v1/issue    { adminSecret, product, domain, plan, expiresAt, seats }
 *        -> { key }
 *   POST /v1/revoke   { adminSecret, key }
 *   GET  /v1/list     ?adminSecret=...
 *
 * Self-serve purchase (when STRIPE_SECRET_KEY is set on this server):
 *   GET  /v1/checkout?product=drop-store&domain=…
 *        -> { url }  Stripe Checkout hosted page
 *   POST /v1/stripe-webhook   Stripe event callback; completed sessions
 *                             auto-issue a licence and email it if
 *                             RESEND_API_KEY is set.
 *   GET  /v1/purchase/:sessionId -> { status, key? }  poll after payment
 *
 * Storage is a JSON file so the whole thing runs with `node server.mjs`.
 * Swap `store` for Postgres when you outgrow it.
 */
import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.LICENCE_DB ?? join(__dirname, 'licences.json');
const ADMIN_SECRET = process.env.LICENCE_ADMIN_SECRET ?? '';
const PORT = Number(process.env.PORT ?? 4660);

// ---- self-serve purchase -------------------------------------------------
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
// Price shown on the checkout page (minor units). Swap for a Stripe Price id
// when you want multi-currency or tax-inclusive pricing.
const LICENCE_PRICE = process.env.LICENCE_PRICE ?? '4900';
const LICENCE_CURRENCY = process.env.LICENCE_CURRENCY ?? 'usd';
const LICENCE_PLAN = process.env.LICENCE_PLAN ?? 'standard';
const LICENCE_DURATION_DAYS = Number(process.env.LICENCE_DAYS ?? 365);
const SITE_ORIGIN = process.env.LICENCE_SITE_ORIGIN ?? `http://localhost:${PORT}`;
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const MAIL_FROM = process.env.MAIL_FROM ?? 'DROP <onboarding@resend.dev>';

function load() {
  if (!existsSync(DB_PATH)) return { keys: {} };
  return JSON.parse(readFileSync(DB_PATH, 'utf8'));
}
function save(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

/** Human-typable key: DROP-XXXX-XXXX-XXXX-XXXX */
function newKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chunk = () =>
    Array.from({ length: 4 }, () => alphabet[randomBytes(1)[0] % alphabet.length]).join('');
  return `DROP-${chunk()}-${chunk()}-${chunk()}-${chunk()}`;
}
const hashKey = (key) => createHash('sha256').update(key.trim().toUpperCase()).digest('hex');

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

function body(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

/** Timing-safe compare so admin-secret checks don't leak byte-by-byte. */
function secretsMatch(a) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(ADMIN_SECRET);
  if (ab.length !== bb.length) {
    // Burn comparable time so length doesn't leak either.
    timingSafeEqual(bb, bb);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function requireAdmin(data, res) {
  if (!ADMIN_SECRET) {
    json(res, 503, { error: 'LICENCE_ADMIN_SECRET is not configured' });
    return false;
  }
  if (!secretsMatch(data.adminSecret, ADMIN_SECRET)) {
    json(res, 403, { error: 'Forbidden' });
    return false;
  }
  return true;
}

/* Naive in-memory limiter: fine for a single-process admin API. */
const WINDOW_MS = 60_000;
const WINDOW_MAX = 120;
const hits = new Map();
function tooManyRequests(req) {
  const key = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.reset) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > WINDOW_MAX;
}

/** Activation log, so a shared key is visible. */
function record(db, entry) {
  db.activations ??= [];
  db.activations.push({ ...entry, at: new Date().toISOString() });
  if (db.activations.length > 5000) db.activations = db.activations.slice(-5000);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (tooManyRequests(req)) return json(res, 429, { error: 'Too many requests' });

  if (req.method === 'POST' && url.pathname === '/v1/verify') {
    const data = await body(req);
    const db = load();
    const record_ = db.keys[hashKey(data.key ?? '')];

    if (!record_) return json(res, 404, { valid: false, error: '授权码不存在' });
    if (record_.revoked) return json(res, 403, { valid: false, error: '授权码已被吊销' });
    if (record_.product && data.product && record_.product !== data.product) {
      return json(res, 403, { valid: false, error: '授权码不适用于该产品' });
    }
    if (record_.domain && data.domain && record_.domain !== data.domain) {
      return json(res, 403, { valid: false, error: `授权码绑定域名 ${record_.domain}` });
    }
    if (record_.expiresAt && new Date(record_.expiresAt) < new Date()) {
      return json(res, 200, { valid: false, error: '授权已过期', expiresAt: record_.expiresAt });
    }

    // Pin the key to the first host that passes every validity check.
    // A failed attempt must never consume the seat.
    const pinned = record_.fingerprint;
    const seats = record_.seats ?? 1;
    if (seats <= 1 && pinned && data.fingerprint && pinned !== data.fingerprint) {
      return json(res, 403, { valid: false, error: '授权码已在其他主机激活' });
    }
    if (!pinned) {
      record_.fingerprint = data.fingerprint ?? null;
      record_.activatedAt = new Date().toISOString();
    }

    record(db, { keyHash: hashKey(data.key), domain: data.domain, fingerprint: data.fingerprint });
    save(db);

    return json(res, 200, {
      valid: true,
      plan: record_.plan,
      domain: record_.domain ?? data.domain,
      expiresAt: record_.expiresAt ?? null,
      seats: record_.seats ?? 1,
    });
  }

  if (req.method === 'POST' && url.pathname === '/v1/issue') {
    const data = await body(req);
    if (!requireAdmin(data, res)) return;
    const db = load();
    const key = newKey();
    db.keys[hashKey(key)] = {
      product: data.product ?? 'drop-store',
      domain: data.domain ?? null,
      plan: data.plan ?? 'standard',
      expiresAt: data.expiresAt ?? null,
      seats: data.seats ?? 1,
      revoked: false,
      createdAt: new Date().toISOString(),
    };
    save(db);
    // Returned once; only the hash is stored.
    return json(res, 200, { key });
  }

  if (req.method === 'POST' && url.pathname === '/v1/revoke') {
    const data = await body(req);
    if (!requireAdmin(data, res)) return;
    const db = load();
    const rec = db.keys[hashKey(data.key ?? '')];
    if (!rec) return json(res, 404, { error: '授权码不存在' });
    rec.revoked = true;
    save(db);
    return json(res, 200, { revoked: true });
  }

  if (req.method === 'GET' && url.pathname === '/v1/list') {
    if (!ADMIN_SECRET || !secretsMatch(url.searchParams.get('adminSecret'), ADMIN_SECRET)) {
      return json(res, 403, { error: 'Forbidden' });
    }
    const db = load();
    return json(res, 200, {
      keys: Object.values(db.keys).map((k) => ({
        ...k,
        keyHash: undefined,
      })),
      activations: (db.activations ?? []).slice(-50),
    });
  }

  if (url.pathname === '/health') return json(res, 200, { ok: true });

  // ---- self-serve purchase ------------------------------------------------
  if (req.method === 'GET' && url.pathname === '/v1/checkout') {
    if (!STRIPE_SECRET) return json(res, 503, { error: 'Self-serve purchase is not enabled' });
    try {
      const { url: checkoutUrl, sessionId } = await createStripeCheckout(url.searchParams.get('domain') ?? '');
      return json(res, 200, { url: checkoutUrl, sessionId });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/stripe-webhook') {
    return handleStripeWebhook(req, res);
  }

  if (req.method === 'GET' && url.pathname.startsWith('/v1/purchase/')) {
    const sessionId = url.pathname.split('/')[3] ?? '';
    const db = load();
    const purchase = (db.purchases ?? {})[sessionId];
    if (!purchase) return json(res, 404, { status: 'unknown' });
    return json(res, 200, { status: purchase.status, key: purchase.key ?? null });
  }

  json(res, 404, { error: 'Not found' });
});


// ---- purchase implementation ----------------------------------------------

async function stripeAPI(path, payload) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(payload).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Stripe ${res.status}`);
  return data;
}

async function createStripeCheckout(domain) {
  const session = await stripeAPI('checkout/sessions', {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': LICENCE_CURRENCY,
    'line_items[0][price_data][unit_amount]': LICENCE_PRICE,
    'line_items[0][price_data][product_data][name]': `DROP Store licence (${LICENCE_PLAN}, ${LICENCE_DURATION_DAYS} days)`,
    ...(domain
      ? { 'metadata[domain]': domain, 'line_items[0][price_data][product_data][description]': `Bound to ${domain}` }
      : {}),
    success_url: `${SITE_ORIGIN}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_ORIGIN}/purchase-cancelled`,
  });
  const db = load();
  db.purchases ??= {};
  db.purchases[session.id] = { status: 'pending', domain: domain || null, createdAt: new Date().toISOString() };
  save(db);
  return { url: session.url, sessionId: session.id };
}

/** Minimal Stripe webhook signature check (t=…,v1=… over `${t}.${payload}`). */
async function handleStripeWebhook(req, res) {
  const raw = await new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });

  if (!STRIPE_WEBHOOK_SECRET) return json(res, 503, { error: 'Webhook secret not configured' });

  const sig = req.headers['stripe-signature'] ?? '';
  const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=')));
  const ts = Number(parts.t);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
    return json(res, 400, { error: 'Stale signature' });
  }
  const crypto = await import('node:crypto');
  const a = Buffer.from(parts.v1 ?? '', 'hex');
  const b = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(`${ts}.${raw}`).digest();
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return json(res, 400, { error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: 'Invalid payload' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const db = load();
    const purchase = (db.purchases ?? {})[session.id];
    if (purchase && purchase.status !== 'completed') {
      const key = newKey();
      const expiresAt = new Date(Date.now() + LICENCE_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      db.keys[hashKey(key)] = {
        product: 'drop-store',
        domain: purchase.domain ?? null,
        plan: LICENCE_PLAN,
        expiresAt,
        seats: 1,
        revoked: false,
        createdAt: new Date().toISOString(),
        purchaseSession: session.id,
      };
      purchase.status = 'completed';
      purchase.key = key;
      record(db, { keyHash: hashKey(key), domain: purchase.domain, fingerprint: null, source: 'purchase' });
      save(db);
      const email = session.customer_details?.email;
      if (email) await mailKey(email, key, expiresAt).catch(() => {});
    }
  }

  return json(res, 200, { received: true });
}

async function mailKey(to, key, expiresAt) {
  if (!RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      subject: 'Your DROP Store licence key',
      html: `<p>Your licence key:</p><p style="font-family:monospace;font-size:18px"><strong>${key}</strong></p>
             <p>Valid until ${expiresAt.slice(0, 10)}. Activate it at your store's /license page.</p>`,
    }),
  });
}

server.listen(PORT, () => {
  console.log(`licence server on :${PORT}`);
  console.log(`db: ${DB_PATH}`);
  if (!ADMIN_SECRET) console.log('⚠ LICENCE_ADMIN_SECRET unset — issuing keys is disabled');
});
