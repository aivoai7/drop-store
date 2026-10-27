#!/usr/bin/env node
/**
 * Runtime integrity check. Recomputes hashes of the protected files and
 * verifies the manifest signature against the vendor's baked-in public key.
 * Any mismatch — one edited line, one removed file, one swapped manifest —
 * exits the process. Called at boot (instrumentation.ts) and before checkout.
 */
import { createHash, verify, createPublicKey } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function loadModule() {
  const src = readFileSync(join(root, "src/lib/integrity.ts"), "utf8");
  const pub = src.match(/VENDOR_PUBLIC_KEY = Buffer\.from\(\s*"([^"]+)"/)?.[1] ?? "";
  const ips = (src.match(/VENDOR_IPS = \[([\s\S]*?)\]/)?.[1] ?? "").match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
  const files = (src.match(/PROTECTED_FILES = \[([\s\S]*?)\]/)?.[1] ?? "").match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
  // The embedded value is base64 of the DER-encoded SPKI public key.
  const der = Buffer.from(pub, "base64");
    const publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
  return { publicKey, vendorIps: ips, files };
}

export function verifyIntegrity() {
  const { publicKey, files } = loadModule();

  const manifestPath = join(root, "integrity-manifest.json");
  if (!existsSync(manifestPath)) {
    console.error("[integrity] manifest missing");
    process.exit(70);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const payload = JSON.stringify({ version: manifest.version, files: manifest.files });
  const ok = verify(
    null,
    Buffer.from(payload),
    publicKey,
    Buffer.from(manifest.signature, "base64"),
  );
  if (!ok) {
    console.error("[integrity] manifest signature invalid");
    process.exit(70);
  }

  for (const rel of files) {
    const p = join(root, rel);
    if (!existsSync(p)) {
      console.error(`[integrity] protected file removed: ${rel}`);
      process.exit(70);
    }
    const hash = createHash("sha256").update(readFileSync(p)).digest("hex");
    if (hash !== manifest.files[rel]) {
      console.error(`[integrity] protected file modified: ${rel}`);
      process.exit(70);
    }
  }
  return true;
}

export function isVendorIp(ip) {
  const { vendorIps } = loadModule();
  return vendorIps.includes(ip);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyIntegrity();
  console.log("[integrity] OK");
}
