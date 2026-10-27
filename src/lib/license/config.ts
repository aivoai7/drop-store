/**
 * Licence enforcement is opt-in: a deployment without LICENCE_SERVER_URL runs
 * unlicensed (useful for the vendor's own dev/staging). Set it in production.
 */
export const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL?.replace(/\/$/, "") ?? "";
export const LICENSE_KEY = process.env.LICENSE_KEY ?? "";
export const LICENSE_PRODUCT = process.env.LICENSE_PRODUCT ?? "drop-store";

/** Re-check interval; the cached state is trusted in between. */
export const CHECK_INTERVAL_MS = Number(process.env.LICENSE_CHECK_INTERVAL_MS ?? 6 * 60 * 60 * 1000);

/** How long an unreachable server keeps the store open before locking. */
export const GRACE_MS = Number(process.env.LICENSE_GRACE_MS ?? 72 * 60 * 60 * 1000);

export const enforcementEnabled = Boolean(LICENSE_SERVER_URL);

export type LicenseStatus = "active" | "invalid" | "expired" | "unreachable" | "unlicensed";
