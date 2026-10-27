import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money, parseList } from "@/lib/format";
import { canEdit } from "@/lib/permissions";
import { ProductForm } from "@/components/admin/ProductForm";
import { deleteProduct, updateProduct, updateVariantStock } from "@/lib/product-actions";
import { at } from "@/lib/admin-copy/zh";
import { adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));

  const { id } = await params;
  const { saved, error } = await searchParams;

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id }, include: { variants: true, category: true } }),
    prisma.category.findMany({ orderBy: { position: "asc" } }),
  ]);
  if (!product) notFound();

  const editable = canEdit(admin.role);
  const variantStock: Record<string, number> = {};
  for (const v of product.variants) variantStock[`${v.color}|${v.size}`] = v.stock;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={adminPath("/products")} className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white">
            ← {at("prod.title")}
          </Link>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">{product.name}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {product.category.name} · {money(product.price)} · {product.stock} in stock
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/product/${product.slug}`}
            target="_blank"
            className="border border-white/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
          >
            {at("pf.viewLive")}
          </Link>
          {editable && (
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={product.id} />
              <button className="border border-red-500/50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500 hover:text-white">
                {at("pf.delete")}
              </button>
            </form>
          )}
        </div>
      </div>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("c.saved")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      {editable ? (
        <div className="mt-6">
          <ProductForm
            initial={{
              id: product.id,
              name: product.name,
              slug: product.slug,
              tagline: product.tagline,
              description: product.description,
              price: (product.price / 100).toFixed(2),
              compareAt: product.compareAt ? (product.compareAt / 100).toFixed(2) : "",
              categoryId: product.categoryId,
              badge: product.badge ?? "",
              status: product.status,
              featured: product.featured,
              colors: parseList(product.colors),
              sizes: parseList(product.sizes),
              images: parseList(product.images),
              variantStock,
            }}
            categories={categories}
            action={updateProduct}
            submitLabel={at("pf.saveChanges")}
          />
        </div>
      ) : (
        <div className="mt-6 border border-white/10 p-4 text-sm text-neutral-400">
          {at("pf.readOnly")}
        </div>
      )}

      <h2 className="mt-10 text-xs font-black uppercase tracking-widest text-neutral-400">{at("pf.variantStock")}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
            <tr>
              <th className="py-2 pr-3">{at("pf.sku")}</th>
              <th className="py-2 pr-3">{at("pf.color")}</th>
              <th className="py-2 pr-3">{at("pf.size")}</th>
              <th className="py-2 pr-3">{at("c.price")}</th>
              <th className="py-2">{at("c.stock")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {product.variants.map((v) => (
              <tr key={v.id}>
                <td className="py-2 pr-3 font-mono text-[11px] text-neutral-400">{v.sku}</td>
                <td className="py-2 pr-3 text-xs">{v.color}</td>
                <td className="py-2 pr-3 text-xs">{v.size}</td>
                <td className="py-2 pr-3 text-xs">{money(v.price ?? product.price)}</td>
                <td className="py-2">
                  {editable ? (
                    <form action={updateVariantStock} className="flex items-center gap-1">
                      <input type="hidden" name="variantId" value={v.id} />
                      <input type="hidden" name="productId" value={product.id} />
                      <input
                        name="stock"
                        type="number"
                        min={0}
                        defaultValue={v.stock}
                        className={`w-16 border px-2 py-1 text-sm ${
                          v.stock === 0 ? "border-red-500 text-red-400" : v.stock <= 5 ? "border-amber-500 text-amber-400" : "border-white/20"
                        }`}
                      />
                      <button className="bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                        Save
                      </button>
                    </form>
                  ) : (
                    <span>{v.stock}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
