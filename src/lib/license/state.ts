import { createHash } from "node:crypto";
import { VENDOR_IPS } from "../integrity";
import { prisma } from "../db";
import { headers } from "next/headers";
import {
  CHECK_INTERVAL_MS,
  GRACE_MS,
  LICENSE_KEY,
  LICENSE_PRODUCT,
  LICENSE_SERVER_URL,
  TRIAL_MS,
  enforcementEnabled,
  type LicenseStatus,
} from "./config";

export type LicenseView = {
  ok: boolean;
  status: LicenseStatus;
  plan: string | null;
  domain: string | null;
  expiresAt: Date | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  /** True when we are inside the offline grace window. */
  inGrace: boolean;
  enforcementEnabled: boolean;
  /** Trial state: null when this deployment has never run a trial. */
  trial: {
    status: "trial" | "trial_expired" | "used";
    startedAt: Date;
    endsAt: Date;
    /** Whole days left, only meaningful while status is "trial". */
    daysLeft: number;
  } | null;
};

/** Stable-ish install identity: host + product. Prevents copying one key to many hosts. */
export function fingerprintFor(domain: string) {
  return createHash("sha256").update(`${LICENSE_PRODUCT}:${domain}`).digest("hex").slice(0, 32);
}

export async function resolveDomain() {
  if (process.env.SITE_URL) {
    try {
      return new URL(process.env.SITE_URL).hostname;
    } catch {
      /* fall through */
    }
  }
  try {
    const h = await headers();
    return h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost";
  } catch {
    return "localhost";
  }
}

async function readState() {
  return prisma.licenseState.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

function trialView(row: { trialStartedAt: Date | null }, now: number): LicenseView["trial"] {
  if (!row.trialStartedAt) return null;
  const startedAt = row.trialStartedAt;
  const endsAt = new Date(startedAt.getTime() + TRIAL_MS);
  if (now >= endsAt.getTime()) {
    return { status: "trial_expired", startedAt, endsAt, daysLeft: 0 };
  }
  const msLeft = endsAt.getTime() - now;
  return {
    status: "trial",
    startedAt,
    endsAt,
    daysLeft: Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
  };
}

/**
 * Vendor machines skip licence enforcement entirely. The IP list lives inside
 * the signed integrity set, so editing it changes the file hash, fails
 * verification, and crashes the process. SERVER_HOST_IP is set at boot to the
 * machine's own address (docker entrypoint or systemd unit).
 */
function isVendorBypass(): boolean {
  const candidates = new Set(VENDOR_IPS);
  return candidates.has(process.env.SERVER_HOST_IP ?? "");
}

function toView(
  row: Awaited<ReturnType<typeof readState>>,
  now = Date.now(),
): LicenseView {
  if (!enforcementEnabled) {
    return {
      ok: true,
      status: "unlicensed",
      plan: "development",
      domain: null,
      expiresAt: null,
      lastCheckedAt: row.lastCheckedAt,
      lastError: null,
      inGrace: false,
      enforcementEnabled: false,
      trial: null,
    };
  }

  const trial = trialView(row, now);

  if (isVendorBypass()) {
    return {
      ok: true,
      status: "active",
      plan: "vendor",
      domain: row.domain,
      expiresAt: null,
      lastCheckedAt: row.lastCheckedAt,
      lastError: null,
      inGrace: false,
      enforcementEnabled: true,
      trial: trial ? { ...trial, status: "used" } : null,
    };
  }

  // Trial: a deployment with no key yet is open until the trial ends.
  const hasKey = Boolean(row.licenseKey);
  if (!hasKey) {
    const onTrial = trial?.status === "trial";
    return {
      ok: onTrial,
      status: onTrial ? "trial" : "trial_expired",
      plan: onTrial ? "trial" : null,
      domain: row.domain,
      expiresAt: trial?.endsAt ?? null,
      lastCheckedAt: row.lastCheckedAt,
      lastError: onTrial ? null : "试用期已结束，请输入授权码激活",
      inGrace: false,
      enforcementEnabled: true,
      trial,
    };
  }

  const expiredByDate = row.expiresAt ? row.expiresAt.getTime() < now : false;
  const unreachableSince = row.unreachableSince ?? row.lastCheckedAt;
  const inGrace =
    row.status === "unreachable" &&
    unreachableSince !== null &&
    now - unreachableSince.getTime() < GRACE_MS;

  const ok =
    !expiredByDate &&
    (row.status === "active" || (row.status === "unreachable" && inGrace));

  return {
    ok,
    status: expiredByDate ? "expired" : (row.status as LicenseStatus),
    plan: row.plan,
    domain: row.domain,
    expiresAt: row.expiresAt,
    lastCheckedAt: row.lastCheckedAt,
    lastError: row.lastError,
    inGrace,
    enforcementEnabled: true,
    // A keyed deployment may predate trials entirely; report the trial only
    // when one actually ran.
    trial: trial ? { ...trial, status: "used" } : null,
  };
}

export type ActivationResult =
  | { ok: true; view: LicenseView }
  | { ok: false; error: string };

/**
 * Calls the licence server. `POST /v1/verify` is expected to answer
 * { valid, plan, domain, expiresAt, seats } — see licence-server/ for the
 * reference implementation shipped alongside this store.
 */
export async function verifyWithServer(key: string, domain: string): Promise<ActivationResult> {
  if (!enforcementEnabled) return { ok: false, error: "LICENSE_SERVER_URL is not set" };
  if (!key.trim()) return { ok: false, error: "Enter a licence key" };

  const fingerprint = fingerprintFor(domain);

  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/v1/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: key.trim(),
        domain,
        fingerprint,
        product: LICENSE_PRODUCT,
      }),
      // Never let a slow licence server hang a page render.
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (res.status === 404 || res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const message = body.error ?? "Licence key rejected";
      await persist({ key: key.trim(), status: "invalid", domain: null, lastError: message });
      return { ok: false, error: message };
    }
    if (!res.ok) throw new Error(`Licence server returned ${res.status}`);

    const body = (await res.json()) as {
      valid: boolean;
      plan?: string;
      domain?: string;
      expiresAt?: string | null;
      seats?: number;
      error?: string;
    };

    if (!body.valid) {
      const message = body.error ?? "Licence key rejected";
      await persist({ key: key.trim(), status: "invalid", domain: null, lastError: message });
      return { ok: false, error: message };
    }

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;

    const row = await persist({
      key: key.trim(),
      status: expired ? "expired" : "active",
      domain: body.domain ?? domain,
      plan: body.plan ?? null,
      seats: body.seats ?? 1,
      expiresAt,
      fingerprint,
      lastError: null,
    });

    return { ok: true, view: toView(row) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Licence server unreachable";
    // Keep the previous status so the grace window logic can decide.
    // Keep the earliest failure timestamp across repeated attempts.
    const existing = await prisma.licenseState.findUnique({ where: { id: "default" } });
    const row = await persist({
      key: key.trim(),
      status: "unreachable",
      lastError: message,
      unreachableSince: existing?.unreachableSince ?? new Date(),
    });
    return { ok: true, view: toView(row) };
  }
}

async function persist(patch: {
  key?: string;
  status: string;
  unreachableSince?: Date | null;
  domain?: string | null;
  plan?: string | null;
  seats?: number;
  expiresAt?: Date | null;
  fingerprint?: string | null;
  lastError?: string | null;
}) {
  return prisma.licenseState.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      licenseKey: patch.key ?? null,
      status: patch.status,
      domain: patch.domain ?? null,
      plan: patch.plan ?? null,
      seats: patch.seats ?? 1,
      expiresAt: patch.expiresAt ?? null,
      fingerprint: patch.fingerprint ?? null,
      lastError: patch.lastError ?? null,
      lastCheckedAt: new Date(),
    },
    update: {
      ...(patch.key !== undefined ? { licenseKey: patch.key } : {}),
      status: patch.status,
      ...(patch.domain !== undefined ? { domain: patch.domain } : {}),
      ...(patch.plan !== undefined ? { plan: patch.plan } : {}),
      ...(patch.seats !== undefined ? { seats: patch.seats } : {}),
      ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
      ...(patch.fingerprint !== undefined ? { fingerprint: patch.fingerprint } : {}),
      lastError: patch.lastError ?? null,
      lastCheckedAt: new Date(),
      // Preserve the earliest failure time so the grace window can't be reset.
      ...(patch.unreachableSince !== undefined
        ? { unreachableSince: patch.unreachableSince }
        : patch.status !== "unreachable"
          ? { unreachableSince: null }
          : {}),
    },
  });
}

/**
 * Returns the current licence view, re-verifying when the cache is stale.
 * Every gate in the app goes through this.
 */
export async function getLicense(force = false): Promise<LicenseView> {
  if (!enforcementEnabled) return toView(await readState());

  const row = await ensureTrialStarted();

  const key = row.licenseKey ?? LICENSE_KEY;
  if (!key) {
    // No key yet: the trial clock decides whether the store stays open.
    return toView(row);
  }

  const stale =
    force ||
    !row.lastCheckedAt ||
    Date.now() - row.lastCheckedAt.getTime() > CHECK_INTERVAL_MS;
  if (!stale) return toView(row);

  const domain = row.domain ?? (await resolveDomain());
  const result = await verifyWithServer(key, domain);
  return result.ok ? result.view : { ...toView(await readState()), ok: false };
}

/**
 * Binds the trial to this deployment the first time the store loads. The
 * upsert is the write-once point: later updates never touch trialStartedAt,
 * so re-deploying or wiping the cache row can't reset the clock.
 */
async function ensureTrialStarted() {
  return prisma.licenseState.upsert({
    where: { id: "default" },
    create: { id: "default", trialStartedAt: new Date() },
    update: {},
  });
}

export async function activate(key: string): Promise<ActivationResult> {
  const domain = await resolveDomain();
  return verifyWithServer(key, domain);
}

export async function deactivate() {
  await prisma.licenseState.update({
    where: { id: "default" },
    data: { licenseKey: null, status: "invalid", lastError: "Deactivated locally" },
  });
}
