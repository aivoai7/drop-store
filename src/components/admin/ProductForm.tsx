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
};

const field =
  "w-full border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-400";
const label = "block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  const [colors, setColors] = useState(initial.colors.join(", "));
  const [sizes, setSizes] = useState(initial.sizes.join(", "));
  const [images, setImages] = useState(initial.images.join("\n"));

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

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className={label}>{at("pf.name")}</label>
          <input name="name" required value={name} onChange={(e) => onNameChange(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>{at("pf.slug")}</label>
          <input
            name="slug"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={field}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
          />
        </div>
        <div className="lg:col-span-2">
          <label className={label}>{at("pf.tagline")}</label>
          <input name="tagline" defaultValue={initial.tagline} className={field} maxLength={120} />
        </div>
        <div className="lg:col-span-2">
          <label className={label}>{at("pf.description")}</label>
          <textarea name="description" rows={4} defaultValue={initial.description} className={field} />
        </div>

        <div>
          <label className={label}>{at("pf.price")}</label>
          <input name="price" required defaultValue={initial.price} placeholder="168.00" className={field} />
        </div>
        <div>
          <label className={label}>{at("pf.compareAt")}</label>
          <input name="compareAt" defaultValue={initial.compareAt} placeholder="198.00" className={field} />
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
        <div>
          <label className={label}>{at("pf.badge")}</label>
          <input name="badge" defaultValue={initial.badge} placeholder="NEW" className={field} maxLength={20} />
        </div>

        <div>
          <label className={label}>{at("pf.status")}</label>
          <select name="status" defaultValue={initial.status} className={field}>
            <option value="draft">{at("pf.statusDraft")}</option>
            <option value="active">{at("pf.statusActive")}</option>
            <option value="archived">{at("pf.statusArchived")}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="featured" defaultChecked={initial.featured} className="h-4 w-4 accent-lime-400" />
          {at("pf.featured")}
        </label>

        <div>
          <label className={label}>{at("pf.colors")}</label>
          <input name="colors" required value={colors} onChange={(e) => setColors(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>{at("pf.sizes")}</label>
          <input name="sizes" required value={sizes} onChange={(e) => setSizes(e.target.value)} className={field} />
        </div>

        <div className="lg:col-span-2">
          <label className={label}>{at("pf.images")}</label>
          <textarea name="images" required rows={3} value={images} onChange={(e) => setImages(e.target.value)} className={field} />
          <p className="mt-1 text-[10px] text-neutral-600">{at("pf.imageHint")}</p>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">
          {at("pf.variants", { count: combinations.length })}
        </h2>
        <p className="mt-1 text-[10px] text-neutral-600">
          {at("pf.variantsHint")}
        </p>
        {combinations.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">{at("pf.addOptions")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
                <tr>
                  <th className="py-2 pr-3">{at("pf.color")}</th>
                  <th className="py-2 pr-3">{at("pf.size")}</th>
                  <th className="py-2">{at("c.stock")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {combinations.map(({ color, size }) => {
                  const key = `${color}|${size}`;
                  return (
                    <tr key={key}>
                      <td className="py-2 pr-3 text-xs">{color}</td>
                      <td className="py-2 pr-3 text-xs">{size}</td>
                      <td className="py-2">
                        <input
                          name={`stock.${key}`}
                          type="number"
                          min={0}
                          defaultValue={initial.variantStock[key] ?? 0}
                          className="w-20 border border-white/20 bg-transparent px-2 py-1 text-sm"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 pt-4">
        <button className="bg-lime-400 px-6 py-2.5 text-xs font-black uppercase tracking-widest text-black">
          {submitLabel}
        </button>
        <Link href={adminPath("/products")} className="text-xs uppercase tracking-widest text-neutral-400 hover:text-white">
          {at("c.cancel")}
        </Link>
      </div>
    </form>
  );
}
