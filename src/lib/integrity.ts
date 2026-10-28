/**
 * Code-integrity enforcement. The build script (npm run vendor:sign) hashes
 * the protected files and signs the manifest with the vendor's Ed25519 key;
 * the runtime check (vendor:verify, called at boot and from the checkout
 * path) recomputes the hashes and crashes on any mismatch.
 *
 * The vendor IP exemption lives in the signed set below — editing this file
 * changes its hash and fails verification.
 */
/** SPKI base64 (DER) of the vendor's Ed25519 public key. */
export const VENDOR_PUBLIC_KEY = Buffer.from(
  "MCowBQYDK2VwAyEAB1AGjwqZN9DeffUn0CH2iDU9zEZH0HB7KIekDO2Xz18=",
  "base64",
);

/** IPs that bypass licence enforcement entirely (vendor's own machines). */
export const VENDOR_IPS = [
  "192.168.5.35", // vendor workstation
  "192.168.5.30", // vendor device (LAN scan 2026-10-28)
  "192.168.5.125", // vendor device (LAN scan 2026-10-28)
];

/** Files covered by the integrity manifest, relative to the project root. */
export const PROTECTED_FILES = [
  "src/lib/license/config.ts",
  "src/lib/license/state.ts",
  "src/lib/license/actions.ts",
  "src/middleware.ts",
  "src/lib/integrity.ts",
  "src/app/api/checkout/route.ts",
  "src/lib/checkout-service.ts",
  "src/lib/discounts.ts",
  "src/app/api/license/status/route.ts",
];
