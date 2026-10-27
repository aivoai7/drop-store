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

/**
 * Self-serve purchase, served by the licence server. Shown on the locked
 * /license page as "buy a licence" when the price is configured; empty string
 * hides the button (vendor-only licensing).
 */
export const LICENSE_PRICE_DISPLAY =
  process.env.LICENSE_PRICE_DISPLAY ?? "$49 / year";

/**
 * Free trial for fresh deployments. It starts the first time the store is
 * loaded and ends the moment a licence key is verified — after it expires the
 * site locks to /license until a key is entered.
 */
export const TRIAL_MS = Number(process.env.LICENSE_TRIAL_MS ?? 15 * 24 * 60 * 60 * 1000);

export const enforcementEnabled = Boolean(LICENSE_SERVER_URL);

export type LicenseStatus =
  | "active"
  | "trial"
  | "trial_expired"
  | "invalid"
  | "expired"
  | "unreachable"
  | "unlicensed";
