/**
 * Next.js instrumentation: runs once per server process boot.
 * Verifies the vendor integrity manifest before serving anything; a tampered
 * deployment dies here instead of quietly serving a cracked checkout.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Dynamic import keeps the check out of the bundle graph.
  const { verifyIntegrity } = await import("../scripts/vendor-verify.mjs");
  verifyIntegrity();
}
