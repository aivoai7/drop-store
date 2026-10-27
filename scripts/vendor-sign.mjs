#!/usr/bin/env node
/**
 * Vendor tool: signs the integrity manifest for the protected files.
 *
 *   VENDOR_PRIVATE_KEY="…" npm run vendor:sign
 *
 * Only the vendor runs this; deployments receive integrity-manifest.json and
 * the public key baked into src/lib/integrity.ts. Run it after every change to
 * a protected file before committing/releasing.
 */
import { createHash, sign, createPrivateKey } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PRIV_JWK = process.env.VENDOR_PRIVATE_JWK ?? "";
if (!PRIV_JWK) {
  console.error("VENDOR_PRIVATE_JWK is not set");
  process.exit(1);
}

const root = process.cwd();

// Parse the file list out of the TS module without importing it.
const listMatch = readFileSync("src/lib/integrity.ts", "utf8")
  .match(/PROTECTED_FILES = \[([\s\S]*?)\]/)[1];
const files = [...listMatch.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const manifest = { version: Date.now(), files: {} };
for (const rel of files) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    console.error(`protected file missing: ${rel}`);
    process.exit(1);
  }
  manifest.files[rel] = createHash("sha256").update(readFileSync(p)).digest("hex");
}

const payload = JSON.stringify(manifest);
const signature = sign(null, Buffer.from(payload), createPrivateKey({ key: JSON.parse(PRIV_JWK), format: "jwk" }));

writeFileSync(
  "integrity-manifest.json",
  JSON.stringify({ ...manifest, signature: signature.toString("base64") }, null, 2),
);
console.log(`signed ${files.length} files -> integrity-manifest.json`);
