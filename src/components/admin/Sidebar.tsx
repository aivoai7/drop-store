"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  TicketPercent,
  FolderTree,
  CreditCard,
  ScrollText,
  Settings,
  Plug,
  Percent,
  Truck,
  Coins,
  Wallet,
  Cable,
  KeyRound,
  ExternalLink,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { adminSignOut } from "@/lib/admin-actions";
import { at } from "@/lib/admin-copy/zh";
import { ROLE_LABELS_ZH } from "@/lib/admin-copy/roles";

type NavItem = { href: string; label: string; icon: React.ElementType; badge?: number };

export function Sidebar({
  admin,
  counts,
}: {
  admin: { name: string; email: string; role: string };
  counts: { orders: number; products: number; lowStock: number };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups: Array<{ title: string; items: NavItem[] }> = [
    { title: at("nav.overview"), items: [{ href: "/admin", label: at("nav.dashboard"), icon: LayoutDashboard }] },
    {
      title: at("nav.commerce"),
      items: [
        { href: "/admin/orders", label: at("nav.orders"), icon: ShoppingCart, badge: counts.orders },
        { href: "/admin/products", label: at("nav.products"), icon: Package, badge: counts.lowStock },
        { href: "/admin/categories", label: at("nav.categories"), icon: FolderTree },
        { href: "/admin/customers", label: at("nav.customers"), icon: Users },
        { href: "/admin/discounts", label: at("nav.discounts"), icon: TicketPercent },
        { href: "/admin/payments", label: at("nav.payments"), icon: CreditCard },
      ],
    },
    {
      title: at("nav.config"),
      items: [
        { href: "/admin/settings", label: at("nav.settings"), icon: Settings },
        { href: "/admin/tax", label: at("nav.tax"), icon: Percent },
        { href: "/admin/shipping", label: at("nav.shipping"), icon: Truck },
        { href: "/admin/currencies", label: at("nav.currencies"), icon: Coins },
        { href: "/admin/payment-methods", label: at("nav.paymentMethods"), icon: Wallet },
        { href: "/admin/integrations", label: at("nav.integrations"), icon: Cable },
      ],
    },
    {
      title: at("nav.system"),
      items: [
        { href: "/admin/audit", label: at("nav.audit"), icon: ScrollText },
        { href: "/admin/mcp", label: at("nav.mcp"), icon: Plug },
        { href: "/admin/license", label: at("nav.license"), icon: KeyRound },
        { href: "/admin/account", label: at("nav.account"), icon: Settings },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <Link href="/admin" className="text-lg font-black tracking-[0.25em]" onClick={() => setOpen(false)}>
          DROP
        </Link>
        <span className="hidden text-[10px] font-bold uppercase tracking-widest text-neutral-500 lg:inline">
          {at("nav.admin")}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.title} className="mb-6">
            <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">
              {group.title}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 text-sm transition ${
                        active
                          ? "bg-lime-400 font-bold text-black"
                          : "text-neutral-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon size={16} />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? (
                        <span
                          className={`min-w-5 px-1.5 py-0.5 text-center text-[10px] font-black ${
                            active ? "bg-black text-lime-400" : "bg-white/10 text-neutral-300"
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link href="/" className="flex items-center gap-3 px-3 py-2 text-xs text-neutral-400 hover:text-white">
          <ExternalLink size={14} />
          {at("nav.viewStore")}
        </Link>
        <div className="mt-2 flex items-center gap-3 px-3 py-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center bg-white/10 text-xs font-black">
            {admin.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">{admin.name}</p>
            <p className="truncate text-[10px] text-neutral-500">{admin.email}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-lime-500">{ROLE_LABELS_ZH[admin.role as keyof typeof ROLE_LABELS_ZH] ?? admin.role}</p>
          </div>
          <form action={adminSignOut}>
            <button aria-label={at("nav.signOut")} className="text-neutral-400 hover:text-red-400" title={at("nav.signOut")}>
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-neutral-950 px-4 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="打开菜单">
          <Menu size={20} />
        </button>
        <span className="text-sm font-black tracking-[0.25em]">DROP {at("nav.admin")}</span>
        <Link href="/" aria-label={at("nav.viewStore")}>
          <ExternalLink size={18} />
        </Link>
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-white/10 bg-neutral-950 lg:block">
        {nav}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/70" aria-label="关闭" onClick={() => setOpen(false)} />
          <div className="relative h-full w-64 bg-neutral-950">
            {nav}
            <button
              className="absolute right-3 top-4 z-10 grid h-8 w-8 place-items-center text-neutral-400 hover:text-white"
              onClick={() => setOpen(false)}
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
