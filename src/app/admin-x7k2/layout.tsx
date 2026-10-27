import { Sidebar } from "@/components/admin/Sidebar";
import { getAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();

  // The login page lives inside this layout; render it bare.
  if (!admin) {
    return <div className="min-h-screen bg-neutral-950">{children}</div>;
  }

  const [pendingOrders, productCount, lowStock] = await Promise.all([
    prisma.order.count({ where: { status: "pending" } }),
    prisma.product.count({ where: { status: { not: "archived" } } }),
    prisma.product.count({ where: { stock: { lte: 10 }, status: { not: "archived" } } }),
  ]);

  return (
    <div className="min-h-screen bg-neutral-950">
      <Sidebar admin={admin} counts={{ orders: pendingOrders, products: productCount, lowStock }} />
      <div className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
