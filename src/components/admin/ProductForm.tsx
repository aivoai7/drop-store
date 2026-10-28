"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { at } from "@/lib/admin-copy/zh";
import { adminPath } from "@/lib/admin-path";

export type ProductFormValues = {
  id?: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  price: string;
  compareAt: string;
  categoryId: string;
  badge: string;
  status: string;
  featured: boolean;
  colors: string[];
  sizes: string[];
  images: string[];
  variantStock: Record<string, number>;
  variantPrice: Record<string, string>;
};

const field =
  "w-full border border-white/20 bg-neutral-950 px-3 py-2.5 text-sm outline-none transition-colors focus:border-lime-400 placeholder:text-neutral-600";
const label =
  "mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-500";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-white/10 bg-neutral-950">
      <div className="border-b border-white/10 px-5 py-3.5">
        <h2 className="text-xs font-black uppercase tracking-widest text-neutral-300">{title}</h2>
        {hint && <p className="mt-0.5 text-[11px] text-neutral-600">{hint}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ProductForm({
  initial,
  categories,
  action,
  submitLabel,
  autoSlug,
}: {
  initial: ProductFormValues;
  categories: Array<{ id: string; name: string }>;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  autoSlug?: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [price, setPrice] = useState(initial.price);
  const [compareAt, setCompareAt] = useState(initial.compareAt);
  const [imageText, setImageText] = useState(initial.images.join("\n"));
  const [colors, setColors] = useState(initial.colors.join(", "));
  const [sizes, setSizes] = useState(initial.sizes.join(", "));

  const imageList = useMemo(
    () => imageText.split("\n").map((s) => s.trim()).filter(Boolean),
    [imageText],
  );
  const colorList = useMemo(
    () => colors.split(",").map((c) => c.trim()).filter(Boolean),
    [colors],
  );
  const sizeList = useMemo(
    () => sizes.split(",").map((s) => s.trim()).filter(Boolean),
    [sizes],
  );
  const combinations = useMemo(
    () => colorList.flatMap((color) => sizeList.map((size) => ({ color, size }))),
    [colorList, sizeList],
  );

  const onNameChange = (value: string) => {
    setName(value);
    if (autoSlug) setSlug(slugify(value));
  };

  return (
    <form action={action} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          <Section title={at("pf.secBasic")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label}>{at("pf.name")}</label>
                <input
                  name="name"
                  required
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  className={field}
                  placeholder="VOLT Runner 01"
                />
              </div>
              <div>
                <label className={label}>{at("pf.slug")}</label>
                <input
                  name="slug"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className={`${field} font-mono text-xs`}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                />
              </div>
              <div>
                <label className={label}>{at("pf.category")}</label>
                <select name="categoryId" defaultValue={initial.categoryId} className={field}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={label}>{at("pf.tagline")}</label>
                <input name="tagline" defaultValue={initial.tagline} className={field} maxLength={120} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>{at("pf.description")}</label>
                <textarea name="description" rows={4} defaultValue={initial.description} className={field} />
              </div>
            </div>
          </Section>

          <Section title={at("pf.secMedia")} hint={at("pf.imageHint")}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className={label}>{at("pf.images")}</label>
                <ImageUploader imageList={imageList} onChange={setImageText} />
                <p className="mt-2 text-[10px] text-neutral-600">{at("pf.uploadHint")}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={label}>{at("pf.badge")}</label>
                  <input name="badge" defaultValue={initial.badge} placeholder="NEW" className={field} maxLength={20} />
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 border border-white/10 bg-black px-3 py-3 text-sm">
                  <input type="checkbox" name="featured" defaultChecked={initial.featured} className="h-4 w-4 accent-lime-400" />
                  {at("pf.featured")}
                </label>
                <div>
                  <label className={label}>{at("pf.status")}</label>
                  <div className="grid grid-cols-3 gap-0 border border-white/20">
                    {[
                      { value: "draft", label: at("pf.statusDraft").split(" — ")[0] },
                      { value: "active", label: at("pf.statusActive") },
                      { value: "archived", label: at("pf.statusArchived") },
                    ].map((opt) => (
                      <label key={opt.value} className="cursor-pointer">
                        <input
                          type="radio"
                          name="status"
                          value={opt.value}
                          defaultChecked={initial.status === opt.value}
                          className="peer sr-only"
                        />
                        <span className="block px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-neutral-400 peer-checked:bg-lime-400 peer-checked:text-black">
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section title={at("pf.secVariants")} hint={at("pf.variantsHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>{at("pf.colors")}</label>
                <input
                  name="colors"
                  required
                  value={colors}
                  onChange={(e) => setColors(e.target.value)}
                  className={field}
                  placeholder="Black, Bone"
                />
              </div>
              <div>
                <label className={label}>{at("pf.sizes")}</label>
                <input
                  name="sizes"
                  required
                  value={sizes}
                  onChange={(e) => setSizes(e.target.value)}
                  className={field}
                  placeholder="40, 41, 42"
                />
              </div>
            </div>

            {combinations.length === 0 ? (
              <p className="mt-4 border border-dashed border-white/15 px-4 py-6 text-center text-sm text-neutral-500">
                {at("pf.addOptions")}
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[440px] text-left text-sm">
                  <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
                    <tr>
                      <th className="py-2 pr-3">{at("pf.color")}</th>
                      <th className="py-2 pr-3">{at("pf.size")}</th>
                      <th className="py-2 pr-3">{at("c.price")}</th>
                      <th className="py-2">{at("c.stock")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {combinations.map(({ color, size }) => {
                      const key = `${color}|${size}`;
                      const stock = initial.variantStock[key] ?? 0;
                      return (
                        <tr key={key}>
                          <td className="py-2 pr-3 text-xs">{color}</td>
                          <td className="py-2 pr-3 text-xs">{size}</td>
                          <td className="py-2 pr-3">
                            <input
                              name={`price.${key}`}
                              defaultValue={initial.variantPrice[key] ?? ""}
                              placeholder={(parseFloat(initial.price || "0") || 0).toFixed(2)}
                              className="w-24 border border-white/20 bg-neutral-900 px-2 py-1.5 text-sm"
                            />
                          </td>
                          <td className="py-2">
                            <input
                              name={`stock.${key}`}
                              type="number"
                              min={0}
                              defaultValue={stock}
                              className={`w-20 border bg-neutral-900 px-2 py-1.5 text-sm ${
                                stock === 0 ? "border-red-500/60 text-red-400" : stock <= 5 ? "border-amber-500/60 text-amber-400" : "border-white/20"
                              }`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* Sticky side rail: pricing + live preview */}
        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Section title={at("pf.secPricing")}>
            <div className="space-y-4">
              <div>
                <label className={label}>{at("pf.price")}</label>
                <input
                  name="price"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={field}
                  placeholder="168.00"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className={label}>{at("pf.compareAt")}</label>
                <input
                  name="compareAt"
                  value={compareAt}
                  onChange={(e) => setCompareAt(e.target.value)}
                  className={field}
                  placeholder="198.00"
                  inputMode="decimal"
                />
                {parseFloat(compareAt) > parseFloat(price) && (
                  <p className="mt-1.5 text-[11px] font-bold text-lime-400">
                    −{Math.round((1 - parseFloat(price) / parseFloat(compareAt)) * 100)}% off
                  </p>
                )}
              </div>
            </div>
          </Section>

          {/* Storefront preview */}
          <Section title={at("pf.preview")}>
            <div className="border border-white/10 bg-black">
              <div className="relative aspect-square overflow-hidden bg-neutral-900">
                {imageList[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- matches storefront card conventions
                  <img src={imageList[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-[10px] uppercase tracking-widest text-neutral-600">
                    {at("pf.previewNoImage")}
                  </div>
                )}
                {initial.badge && (
                  <span className="absolute left-2 top-2 bg-lime-400 px-1.5 py-0.5 text-[10px] font-black tracking-widest text-black">
                    {initial.badge}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-bold">{name || "—"}</p>
                <p className="mt-0.5 text-sm">
                  <span className="font-bold">${(parseFloat(price) || 0).toFixed(2)}</span>
                  {parseFloat(compareAt) > parseFloat(price) && (
                    <span className="ml-2 text-xs text-neutral-500 line-through">
                      ${(parseFloat(compareAt) || 0).toFixed(2)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </Section>

          {/* Actions (sticky rail bottom) */}
          <div className="flex items-center gap-3">
            <button className="group flex flex-1 items-center justify-between bg-lime-400 py-3 pl-4 pr-3 text-xs font-black uppercase tracking-widest text-black hover:bg-white">
              {submitLabel}
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            <Link
              href={adminPath("/products")}
              className="text-xs uppercase tracking-widest text-neutral-400 hover:text-white"
            >
              {at("c.cancel")}
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Product image manager: drag-and-drop or click to upload, thumbnails with
 * drag-free reordering (move left) and remove. State is the newline-joined
 * URL list the form posts as `images`, so the server contract is unchanged.
 */
function ImageUploader({ imageList, onChange }: { imageList: string[]; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function commit(next: string[]) {
    onChange(next.join("\n"));
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} 超过 8 MB`);
        continue;
      }
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch("/api/admin/upload", {
          method: "POST",
          body,
        });
        const json = (await res.json()) as { url?: string; error?: string };
        if (json.url) uploaded.push(json.url);
        else setError(json.error ?? `${file.name} 上传失败`);
      } catch {
        setError(`${file.name} 上传失败`);
      }
    }
    if (uploaded.length) commit([...imageList, ...uploaded]);
    setBusy(false);
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...imageList];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  function remove(index: number) {
    commit(imageList.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={`grid cursor-pointer place-items-center border border-dashed px-4 py-6 text-center transition-colors ${
          dragOver ? "border-lime-400 bg-lime-400/5" : "border-white/25 hover:border-white/50"
        }`}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          multiple
          className="sr-only"
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
        />
        {busy ? (
          <span className="text-xs uppercase tracking-widest text-neutral-400">上传中…</span>
        ) : (
          <span className="text-xs text-neutral-400">
            <span className="font-bold text-lime-400">点击上传</span> 或拖拽图片到此处
            <span className="mt-1 block text-[10px] text-neutral-600">JPG / PNG / WebP / AVIF / GIF · 最大 8 MB · 可多选</span>
          </span>
        )}
      </label>
      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}

      {imageList.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {imageList.map((src, i) => (
            <li key={`${src}-${i}`} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails match storefront conventions */}
              <img
                src={src}
                alt=""
                className={`aspect-square w-full border object-cover ${i === 0 ? "border-lime-400" : "border-white/15"}`}
              />
              {i === 0 && (
                <span className="absolute left-1 top-1 bg-lime-400 px-1 py-0.5 text-[9px] font-black tracking-widest text-black">
                  主图
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 hidden justify-between bg-black/80 px-1 py-1 group-hover:flex">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="px-1 text-[11px] text-white disabled:opacity-30"
                  aria-label="前移"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="px-1 text-[11px] text-red-400"
                  aria-label="删除"
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === imageList.length - 1}
                  className="px-1 text-[11px] text-white disabled:opacity-30"
                  aria-label="后移"
                >
                  →
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
