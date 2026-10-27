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
  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`licence server on :${PORT}`);
  console.log(`db: ${DB_PATH}`);
  if (!ADMIN_SECRET) console.log('⚠ LICENCE_ADMIN_SECRET unset — issuing keys is disabled');
});
