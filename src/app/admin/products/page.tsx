import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { money, parseList } from "@/lib/format";
import { canEdit } from "@/lib/permissions";
import { at } from "@/lib/admin-copy/zh";
import { bulkProductAction, toggleProductFeatured } from "@/lib/product-actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: at("prod.tabAll") },
  { key: "active", label: at("prod.tabActive") },
  { key: "draft", label: at("prod.tabDraft") },
  { key: "archived", label: at("prod.tabArchived") },
  { key: "low", label: at("prod.tabLow") },
];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; notice?: string; error?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { status = "all", q = "", notice, error } = await searchParams;
  const search = q.trim();

  const products = await prisma.product.findMany({
    where: {
      ...(status === "low" ? { stock: { lte: 10 } } : status !== "all" ? { status } : {}),
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search } }] }
        : {}),
    },
    include: { category: true, _count: { select: { variants: true } } },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });

  const editable = canEdit(admin.role);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("prod.title")}</h1>
          <p className="mt-1 text-xs text-neutral-500">{at("prod.shown", { count: products.length })}</p>
        </div>
        {editable && (
          <Link
            href="/admin/products/new"
            className="bg-lime-400 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-black"
          >
            {at("prod.new")}
          </Link>
        )}
      </div>

      {notice && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{notice}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/admin/products" : `/admin/products?status=${tab.key}`}
            className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
              status === tab.key ? "border-lime-400 bg-lime-400 text-black" : "border-white/20 hover:border-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
        <form className="ml-auto flex items-center gap-2">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={search}
            placeholder={at("prod.searchPlaceholder")}
            className="w-44 border border-white/20 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-lime-400"
          />
          <button className="border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest">
            {at("prod.find")}
          </button>
        </form>
      </div>

      {products.length === 0 ? (
        <p className="mt-10 text-sm text-neutral-500">{at("prod.noMatch")}</p>
      ) : (
        <form action={bulkProductAction} className="mt-6">
          {editable && (
            <div className="mb-3 flex flex-wrap items-center gap-2 border border-white/10 p-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{at("prod.bulk")}</span>
              <select name="bulkAction" className="border border-white/20 bg-black px-2 py-1.5 text-[11px]">
                <option value="activate">{at("prod.bulkActivate")}</option>
                <option value="archive">{at("prod.bulkArchive")}</option>
                <option value="feature">{at("prod.bulkFeature")}</option>
                <option value="unfeature">{at("prod.bulkUnfeature")}</option>
                <option value="price">{at("prod.bulkPrice")}</option>
                <option value="delete">{at("prod.bulkDelete")}</option>
              </select>
              <input
                name="percent"
                type="number"
                placeholder="%"
                className="w-16 border border-white/20 bg-transparent px-2 py-1.5 text-[11px]"
              />
              <button className="bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-black">
                {at("prod.applyToSelected")}
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/15 text-[10px] uppercase tracking-widest text-neutral-500">
                <tr>
                  {editable && <th className="w-8 py-2" />}
                  <th className="py-2 pr-3">{at("prod.title")}</th>
                  <th className="py-2 pr-3">{at("c.status")}</th>
                  <th className="py-2 pr-3">{at("c.price")}</th>
                  <th className="py-2 pr-3">{at("c.stock")}</th>
                  <th className="py-2 pr-3">{at("prod.featured")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {products.map((p) => (
                  <tr key={p.id}>
                    {editable && (
                      <td className="py-2">
                        <input type="checkbox" name="ids" value={p.id} className="h-3.5 w-3.5 accent-lime-400" />
                      </td>
                    )}
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={parseList(p.images)[0]} alt="" className="h-9 w-9 bg-neutral-900 object-cover" />
                        <div className="min-w-0">
                          <Link href={`/admin/products/${p.id}`} className="font-bold uppercase hover:text-lime-400">
                            {p.name}
                          </Link>
                          <p className="text-[10px] text-neutral-500">
                            {p.category.name} · {at("prod.variants", { count: p._count.variants })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          p.status === "active"
                            ? "bg-lime-400/15 text-lime-400"
                            : p.status === "draft"
                              ? "bg-amber-400/15 text-amber-400"
                              : "bg-white/10 text-neutral-400"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-bold">{money(p.price)}</td>
                    <td className={`py-2 pr-3 font-bold ${p.stock === 0 ? "text-red-400" : p.stock <= 10 ? "text-amber-400" : ""}`}>
                      {p.stock}
                    </td>
                    <td className="py-2 pr-3">
                      {editable ? (
                        <button
                          formAction={toggleProductFeatured}
                          name="id"
                          value={p.id}
                          className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                            p.featured ? "bg-lime-400 text-black" : "border border-white/20 text-neutral-400"
                          }`}
                        >
                          {p.featured ? at("prod.featured") : at("prod.featuredOff")}
                        </button>
                      ) : (
                        <span className="text-[10px] text-neutral-500">{p.featured ? at("c.yes") : at("c.no")}</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/admin/products/${p.id}`} className="text-[10px] uppercase tracking-widest text-lime-400">
                        {at("c.edit")} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </form>
      )}
    </div>
  );
}
