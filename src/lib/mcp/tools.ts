import { z } from "zod";
import { prisma } from "../db";
import { money, parseList } from "../format";
import { auditMcp, currentPrincipal, McpToolError, requireEdit, requireOwner } from "./context";
import { validateDiscount } from "../discounts";
import { refreshProductStock } from "../variants";
import { refundOrder } from "../payments";
import { restoreOrderStock } from "../stock";
import { hashPassword } from "../password";
import { issueMcpToken, revokeMcpToken } from "./token";

export type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function text(body: unknown) {
  return {
    content: [
      { type: "text" as const, text: typeof body === "string" ? body : JSON.stringify(body, null, 2) },
    ],
  };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof McpToolError) return fail(err.message);
    const message = err instanceof Error ? err.message : "Unknown error";
    return fail(message);
  }
}

const orderSummary = (order: {
  id: string;
  email: string;
  name: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: Date;
  items: Array<{ name: string; quantity: number; size: string; color: string }>;
}) => ({
  id: order.id,
  customer: order.name,
  email: order.email,
  status: order.status,
  paymentStatus: order.paymentStatus,
  total: money(order.total),
  placedAt: order.createdAt.toISOString(),
  items: order.items.map((i) => `${i.name} — ${i.color}/${i.size} ×${i.quantity}`),
});

export const tools = {
  /* ---------------- read ---------------- */

  async list_products(args: { status?: string; query?: string; lowStockOnly?: boolean; limit?: number }) {
    return guard(async () => {
      const rows = await prisma.product.findMany({
        where: {
          ...(args.status && args.status !== "all" ? { status: args.status } : {}),
          ...(args.lowStockOnly ? { stock: { lte: args.lowStockOnly ? 10 : 0 } } : {}),
          ...(args.query
            ? { OR: [{ name: { contains: args.query, mode: "insensitive" } }, { slug: { contains: args.query } }] }
            : {}),
        },
        include: { category: true, variants: true },
        orderBy: { name: "asc" },
        take: Math.min(args.limit ?? 50, 200),
      });
      return text({
        count: rows.length,
        products: rows.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          status: p.status,
          price: money(p.price),
          stock: p.stock,
          featured: p.featured,
          category: p.category.name,
          variants: p.variants.map((v) => ({ sku: v.sku, color: v.color, size: v.size, stock: v.stock })),
        })),
      });
    });
  },

  async get_product(args: { idOrSlug: string }) {
    return guard(async () => {
      const product = await prisma.product.findFirst({
        where: { OR: [{ id: args.idOrSlug }, { slug: args.idOrSlug }] },
        include: { category: true, variants: true },
      });
      if (!product) return fail(`No product matches "${args.idOrSlug}"`);
      return text({
        id: product.id,
        slug: product.slug,
        name: product.name,
        tagline: product.tagline,
        description: product.description,
        status: product.status,
        price: money(product.price),
        compareAt: product.compareAt ? money(product.compareAt) : null,
        category: product.category.name,
        featured: product.featured,
        images: parseList(product.images),
        colors: parseList(product.colors),
        sizes: parseList(product.sizes),
        totalStock: product.stock,
        variants: product.variants.map((v) => ({
          sku: v.sku,
          color: v.color,
          size: v.size,
          stock: v.stock,
          price: money(v.price ?? product.price),
        })),
      });
    });
  },

  async list_orders(args: { status?: string; query?: string; limit?: number }) {
    return guard(async () => {
      const orders = await prisma.order.findMany({
        where: {
          ...(args.status && args.status !== "all" ? { status: args.status } : {}),
          ...(args.query
            ? {
                OR: [
                  { id: { contains: args.query, mode: "insensitive" } },
                  { email: { contains: args.query, mode: "insensitive" } },
                  { name: { contains: args.query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 25, 100),
      });
      return text({ count: orders.length, orders: orders.map(orderSummary) });
    });
  },

  async get_order(args: { orderId: string }) {
    return guard(async () => {
      const order = await prisma.order.findUnique({ where: { id: args.orderId }, include: { items: true } });
      if (!order) return fail(`No order with id ${args.orderId}`);
      return text({
        ...orderSummary(order),
        address: `${order.address}, ${order.city}, ${order.country}`,
        subtotal: money(order.subtotal),
        shipping: order.shipping === 0 ? "Free" : money(order.shipping),
        discountCode: order.discountCode,
        discountAmount: money(order.discountAmount),
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        adminNote: order.adminNote,
      });
    });
  },

  async store_overview() {
    return guard(async () => {
      const [orders, products, customers, discounts] = await Promise.all([
        prisma.order.findMany({ select: { total: true, paymentStatus: true, status: true } }),
        prisma.product.findMany({ select: { stock: true, status: true } }),
        prisma.user.count(),
        prisma.discount.count({ where: { active: true } }),
      ]);
      const paid = orders.filter((o) => o.paymentStatus === "paid");
      const revenue = paid.reduce((n, o) => n + o.total, 0);
      return text({
        revenue: money(revenue),
        paidOrders: paid.length,
        averageOrderValue: money(paid.length ? Math.round(revenue / paid.length) : 0),
        pendingFulfilment: orders.filter((o) => o.status === "pending").length,
        customers,
        activeProducts: products.filter((p) => p.status === "active").length,
        lowStockProducts: products.filter((p) => p.stock <= 10 && p.status !== "archived").length,
        activeDiscounts: discounts,
      });
    });
  },

  async list_discounts() {
    return guard(async () => {
      const rows = await prisma.discount.findMany({
        include: { _count: { select: { redemptions: true } } },
        orderBy: { createdAt: "desc" },
      });
      return text(
        rows.map((d) => ({
          code: d.code,
          type: d.type,
          value: d.type === "percentage" ? `${d.value}%` : money(d.value),
          minSubtotal: money(d.minSubtotal),
          used: d.usedCount,
          usageLimit: d.usageLimit,
          active: d.active,
          startsAt: d.startsAt?.toISOString() ?? null,
          endsAt: d.endsAt?.toISOString() ?? null,
        })),
      );
    });
  },

  async list_customers(args: { query?: string; limit?: number }) {
    return guard(async () => {
      const users = await prisma.user.findMany({
        where: args.query
          ? {
              OR: [
                { email: { contains: args.query, mode: "insensitive" } },
                { name: { contains: args.query, mode: "insensitive" } },
              ],
            }
          : undefined,
        include: { orders: { select: { total: true, paymentStatus: true } } },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 25, 100),
      });
      return text(
        users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          disabled: u.disabled,
          orders: u.orders.length,
          spent: money(
            u.orders.filter((o) => o.paymentStatus === "paid").reduce((n, o) => n + o.total, 0),
          ),
        })),
      );
    });
  },

  /* ---------------- write ---------------- */

  async update_variant_stock(args: { sku: string; stock: number }) {
    return guard(async () => {
      const principal = requireEdit();
      const variant = await prisma.variant.findUnique({ where: { sku: args.sku } });
      if (!variant) return fail(`No variant with SKU ${args.sku}`);
      if (args.stock < 0) return fail("Stock cannot be negative");

      await prisma.variant.update({ where: { id: variant.id }, data: { stock: args.stock } });
      await refreshProductStock(variant.productId);
      await auditMcp("variant.stock.changed", args.sku, { from: variant.stock, to: args.stock });
      const product = await prisma.product.findUnique({ where: { id: variant.productId } });
      return text({
        ok: true,
        sku: args.sku,
        from: variant.stock,
        to: args.stock,
        productTotalStock: product?.stock,
        by: principal.email,
      });
    });
  },

  async update_order_status(args: { orderId: string; status: string }) {
    return guard(async () => {
      requireEdit();
      if (!["pending", "paid", "shipped", "cancelled"].includes(args.status)) {
        return fail("Status must be one of: pending, paid, shipped, cancelled");
      }
      const order = await prisma.order.findUnique({ where: { id: args.orderId } });
      if (!order) return fail(`No order with id ${args.orderId}`);

      await prisma.order.update({
        where: { id: args.orderId },
        data: {
          status: args.status,
          ...(args.status === "shipped" && !order.shippedAt ? { shippedAt: new Date() } : {}),
          ...(args.status === "cancelled" && !order.cancelledAt ? { cancelledAt: new Date() } : {}),
        },
      });
      if (args.status === "cancelled" && order.status !== "cancelled") {
        await restoreOrderStock(args.orderId);
      }
      await auditMcp("order.status.changed", args.orderId, { from: order.status, to: args.status });
      return text({ ok: true, orderId: args.orderId, from: order.status, to: args.status });
    });
  },

  async ship_order(args: { orderId: string; carrier?: string; trackingNumber: string }) {
    return guard(async () => {
      requireEdit();
      const order = await prisma.order.findUnique({ where: { id: args.orderId } });
      if (!order) return fail(`No order with id ${args.orderId}`);

      await prisma.order.update({
        where: { id: args.orderId },
        data: {
          carrier: args.carrier ?? null,
          trackingNumber: args.trackingNumber,
          status: "shipped",
          shippedAt: order.shippedAt ?? new Date(),
        },
      });
      await auditMcp("order.shipped", args.orderId, { carrier: args.carrier, tracking: args.trackingNumber });
      return text({
        ok: true,
        orderId: args.orderId,
        carrier: args.carrier ?? null,
        trackingNumber: args.trackingNumber,
        note: "Customer shipping email is sent by the web admin; MCP records the shipment.",
      });
    });
  },

  async refund_order(args: { orderId: string; amount?: number; reason?: string }) {
    return guard(async () => {
      const principal = requireEdit();
      const result = await refundOrder({
        orderId: args.orderId,
        amount: args.amount ? Math.round(args.amount * 100) : undefined,
        reason: args.reason,
        actorEmail: principal.email,
      });
      if (!result.ok) return fail(result.reason);
      await auditMcp(result.partial ? "order.partially_refunded" : "order.refunded", args.orderId, {
        amount: result.amount,
        provider: result.provider,
      });
      return text({
        ok: true,
        orderId: args.orderId,
        refunded: money(result.amount),
        partial: result.partial,
        provider: result.provider,
        paymentStatus: result.partial ? "partially_refunded" : "refunded",
      });
    });
  },

  async check_discount(args: { code: string; subtotal: number; email?: string }) {
    return guard(async () => {
      const result = await validateDiscount(args.code, {
        subtotal: Math.round(args.subtotal * 100),
        email: args.email,
      });
      if (!result.ok) return text({ valid: false, reason: result.error });
      return text({
        valid: true,
        code: result.discount.code,
        amountOff: money(result.amount),
        newTotal: money(result.subtotal),
        shipping: result.shipping === 0 ? "Free" : money(result.shipping),
        orderTotal: money(result.total),
      });
    });
  },

  async create_discount(args: {
    code: string;
    type: "percentage" | "fixed";
    value: number;
    minSubtotal?: number;
    usageLimit?: number;
    endsAt?: string;
  }) {
    return guard(async () => {
      requireEdit();
      const code = args.code.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return fail("Code must be 3-30 characters: A-Z, 0-9, - or _");
      if (args.type === "percentage" && (args.value <= 0 || args.value > 100)) {
        return fail("Percentage must be between 1 and 100");
      }
      if (args.type === "fixed" && args.value <= 0) return fail("Fixed amount must be greater than zero");

      const clash = await prisma.discount.findUnique({ where: { code } });
      if (clash) return fail(`Code ${code} already exists`);

      const discount = await prisma.discount.create({
        data: {
          code,
          type: args.type,
          value: args.type === "fixed" ? Math.round(args.value * 100) : Math.round(args.value),
          minSubtotal: Math.round((args.minSubtotal ?? 0) * 100),
          usageLimit: args.usageLimit ?? null,
          endsAt: args.endsAt ? new Date(args.endsAt) : null,
        },
      });
      await auditMcp("discount.created", code, { type: args.type, value: args.value });
      return text({ ok: true, id: discount.id, code: discount.code, active: discount.active });
    });
  },

  async set_product_status(args: { idOrSlug: string; status: "draft" | "active" | "archived" }) {
    return guard(async () => {
      requireEdit();
      const product = await prisma.product.findFirst({
        where: { OR: [{ id: args.idOrSlug }, { slug: args.idOrSlug }] },
      });
      if (!product) return fail(`No product matches "${args.idOrSlug}"`);

      await prisma.product.update({ where: { id: product.id }, data: { status: args.status } });
      await auditMcp("product.status.changed", product.slug, { from: product.status, to: args.status });
      return text({ ok: true, slug: product.slug, from: product.status, to: args.status });
    });
  },

  async set_customer_disabled(args: { email: string; disabled: boolean }) {
    return guard(async () => {
      requireEdit();
      const user = await prisma.user.findUnique({ where: { email: args.email.toLowerCase() } });
      if (!user) return fail(`No customer with email ${args.email}`);

      await prisma.user.update({ where: { id: user.id }, data: { disabled: args.disabled } });
      if (args.disabled) await prisma.session.deleteMany({ where: { userId: user.id } });
      await auditMcp(args.disabled ? "customer.disabled" : "customer.enabled", user.email);
      return text({ ok: true, email: user.email, disabled: args.disabled });
    });
  },

  async create_mcp_token(args: { name: string; ownerEmail: string }) {
    return guard(async () => {
      const principal = requireOwner();
      const owner = await prisma.adminUser.findUnique({ where: { email: args.ownerEmail.toLowerCase() } });
      if (!owner) return fail(`No admin with email ${args.ownerEmail}`);
      if (owner.role !== "owner") return fail("Tokens can only be issued for owners");

      const { token, row } = await issueMcpToken({ name: args.name, adminId: owner.id });
      await auditMcp("token.created", row.prefix, { for: owner.email, name: args.name, by: principal.email });
      return text({ ok: true, name: row.name, prefix: row.prefix, token, warning: "Shown once. Store it now." });
    });
  },

  async revoke_mcp_token(args: { prefix: string }) {
    return guard(async () => {
      requireOwner();
      const row = await prisma.mcpToken.findFirst({ where: { prefix: args.prefix, revokedAt: null } });
      if (!row) return fail(`No active token starting with ${args.prefix}`);
      await revokeMcpToken(row.id);
      await auditMcp("token.revoked", row.prefix);
      return text({ ok: true, prefix: row.prefix, revoked: true });
    });
  },

  async whoami() {
    return guard(async () => {
      const principal = currentPrincipal();
      return text({
        email: principal.email,
        name: principal.name,
        role: principal.role,
        permissions: {
          read: true,
          write: principal.role !== "viewer",
          manageTokens: principal.role === "owner",
        },
      });
    });
  },

  async reset_customer_password(args: { email: string; newPassword: string }) {
    return guard(async () => {
      requireEdit();
      if (args.newPassword.length < 8) return fail("Password must be at least 8 characters");
      const user = await prisma.user.findUnique({ where: { email: args.email.toLowerCase() } });
      if (!user) return fail(`No customer with email ${args.email}`);

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(args.newPassword) },
      });
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await auditMcp("customer.password.reset", user.email);
      return text({ ok: true, email: user.email, note: "All sessions were signed out." });
    });
  },
};

export type ToolName = keyof typeof tools;
export { z };
