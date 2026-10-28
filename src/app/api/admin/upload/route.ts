import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAdminUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
]);

/**
 * Product image upload. Files land in public/uploads/<yyyy>/<mm>/<hash>.<ext>
 * and are served statically — no external storage dependency for
 * self-hosted deployments. Admins with edit rights only.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(admin.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "没有收到文件" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "图片超过 8 MB 限制" }, { status: 413 });
  }

  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return NextResponse.json({ error: "仅支持 JPG / PNG / WebP / AVIF / GIF" }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Content-hashed name: same image uploaded twice dedupes naturally.
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const random = randomBytes(4).toString("hex");
  const now = new Date();
  const dir = join(process.cwd(), "public", "uploads", `${now.getFullYear()}`, `${String(now.getMonth() + 1).padStart(2, "0")}`);

  await mkdir(dir, { recursive: true });
  const name = `${hash}-${random}.${ext}`;
  await writeFile(join(dir, name), bytes);

  const url = `/uploads/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${name}`;
  return NextResponse.json({ url });
}
