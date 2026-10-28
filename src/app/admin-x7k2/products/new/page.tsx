import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { ProductForm } from "@/components/admin/ProductForm";
import { createProduct } from "@/lib/product-actions";
import { at } from "@/lib/admin-copy/zh";
import { adminPath } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect(adminPath("/login"));
  if (!canEdit(admin.role)) redirect(adminPath("/products"));

  const { error } = await searchParams;
  const categories = await prisma.category.findMany({ orderBy: { position: "asc" } });

  return (
    <div>
      <Link href={adminPath("/products")} className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white">
        ← {at("prod.title")}
      </Link>
      <h1 className="mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("pf.newTitle")}</h1>
      <p className="mt-1 text-xs text-neutral-500">{at("pf.newSubtitle")}</p>

      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      <div className="mt-6">
        <ProductForm
          initial={{
            name: "",
            slug: "",
            tagline: "",
            description: "",
            price: "",
            compareAt: "",
            categoryId: categories[0]?.id ?? "",
            badge: "",
            status: "draft",
            featured: false,
            colors: ["Black"],
            sizes: ["One Size"],
            images: [],
            variantStock: {},
          variantPrice: {},
          }}
          categories={categories}
          action={createProduct}
          submitLabel={at("pf.create")}
          autoSlug
        />
      </div>
    </div>
  );
}
