import { prisma } from "./db";
import { parseList } from "./format";

export type VariantView = {
  id: string;
  sku: string;
  color: string;
  size: string;
  stock: number;
  price: number;
};

export type ProductView = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  compareAt: number | null;
  badge: string | null;
  colors: string[];
  sizes: string[];
  images: string[];
  featured: boolean;
  stock: number;
  status: string;
  translations: string | null;
  category: { id: string; name: string; slug: string };
  variants: VariantView[];
};

type Row = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  compareAt: number | null;
  badge: string | null;
  colors: string;
  sizes: string;
  images: string;
  featured: boolean;
  stock: number;
  status: string;
  translations: string | null;
  category: { id: string; name: string; slug: string };
  variants: Array<{ id: string; sku: string; color: string; size: string; stock: number; price: number | null }>;
};

export function toView(row: Row): ProductView {
  return {
    ...row,
    colors: parseList(row.colors),
    sizes: parseList(row.sizes),
    images: parseList(row.images),
    variants: row.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      stock: v.stock,
      price: v.price ?? row.price,
    })),
  };
}

const include = { category: true, variants: { orderBy: { size: "asc" as const } } };

export async function getProducts(categorySlug?: string) {
  const rows = await prisma.product.findMany({
    // Drafts and archived products never reach the storefront.
    where: { status: "active", ...(categorySlug ? { category: { slug: categorySlug } } : {}) },
    include,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toView);
}

export async function getProduct(slug: string) {
  const row = await prisma.product.findFirst({
    where: { slug, status: "active" },
    include,
  });
  return row ? toView(row) : null;
}

export async function getCategories() {
  return prisma.category.findMany({
    where: { hidden: false },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}
