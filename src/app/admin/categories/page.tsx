import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { createCategory, deleteCategory, updateCategory } from "@/lib/category-actions";
import { at } from "@/lib/admin-copy/zh";

export const dynamic = "force-dynamic";

const field =
  "w-full border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-400";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; denied?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const { saved, error, denied } = await searchParams;
  const categories = await prisma.category.findMany({
    orderBy: { position: "asc" },
    include: { _count: { select: { products: true } } },
  });
  const editable = canEdit(admin.role);

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{at("cat.title")}</h1>
      <p className="mt-1 text-xs text-neutral-500">{at("cat.count", { count: categories.length })}</p>

      {saved && <p className="mt-4 border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">{at("c.saved")}</p>}
      {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      {denied && <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{at("acc.ownerOnly")}</p>}

      <div className="mt-6 space-y-3">
        {categories.map((c) => (
          <div key={c.id} className="border border-white/10 p-4">
            {editable ? (
              <form action={updateCategory} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto]">
                <input type="hidden" name="id" value={c.id} />
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-500">{at("c.name")}</label>
                  <input name="name" defaultValue={c.name} className={field} />
                  <p className="mt-1 font-mono text-[10px] text-neutral-600">/{c.slug} · {at("cat.productCount", { count: c._count.products })}</p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-500">{at("cat.description")}</label>
                  <input name="description" defaultValue={c.description ?? ""} className={field} />
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-xs">
                  <input type="checkbox" name="hidden" defaultChecked={c.hidden} className="h-4 w-4 accent-lime-400" />
                  {at("cat.hidden")}
                </label>
                <div className="flex items-end gap-2">
                  <button className="bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-black">
                    {at("c.save")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-bold uppercase">{c.name}</p>
                  <p className="text-[10px] text-neutral-500">/{c.slug} · {at("cat.productCount", { count: c._count.products })}</p>
                </div>
              </div>
            )}
            {editable && (
              <form action={deleteCategory} aria-label={`Delete ${c.name}`} className="mt-2 flex justify-end">
                <input type="hidden" name="id" value={c.id} />
                <button className="text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300">
                  {at("cat.delete")}
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <form action={createCategory} className="mt-6 border border-white/10 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{at("cat.new")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input name="name" required placeholder={at("c.name")} className={field} />
            <input name="slug" placeholder={at("cat.slugOptional")} className={field} />
            <button className="bg-lime-400 px-5 py-2 text-[10px] font-black uppercase tracking-widest text-black">
              {at("c.create")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
