import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UPLOADS_ROOT = join(process.cwd(), "public", "uploads");

async function treeSize(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { files, bytes }; // uploads dir doesn't exist yet — nothing stored
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await treeSize(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      const info = await stat(p);
      files += 1;
      bytes += info.size;
    }
  }
  return { files, bytes };
}

/** Photo-store usage for the admin account/storage UI. */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { files, bytes } = await treeSize(UPLOADS_ROOT);
  return NextResponse.json({
    files,
    bytes,
    mb: Number((bytes / (1024 * 1024)).toFixed(1)),
    path: "public/uploads",
  });
}
