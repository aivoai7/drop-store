import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { tools } from "./tools";

/**
 * Single source of truth for the MCP surface. Used by both the stdio binary
 * and the HTTP route so the two transports can never drift apart.
 */
export function buildServer() {
  const server = new McpServer(
    { name: "drop-admin", version: "1.0.0" },
    {
      instructions:
        "Admin tools for the DROP storefront. Money is USD. Read tools are always allowed; " +
        "write tools require a manager or owner token. Every write is recorded in the admin audit log. " +
        "Prefer list_* / get_* before mutating, and confirm destructive actions with the user.",
    },
  );

  const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
  const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Show the admin identity and permissions behind the current MCP token.",
      inputSchema: {},
      annotations: read,
    },
    async () => tools.whoami(),
  );

  server.registerTool(
    "store_overview",
    {
      title: "Store overview",
      description: "Revenue, paid orders, average order value, pending fulfilment, customers, low stock.",
      inputSchema: {},
      annotations: read,
    },
    async () => tools.store_overview(),
  );

  server.registerTool(
    "list_products",
    {
      title: "List products",
      description: "List products with status, price and per-variant stock. Filter by status or text.",
      inputSchema: {
        status: z.enum(["all", "draft", "active", "archived"]).optional(),
        query: z.string().optional().describe("Match name or slug"),
        lowStockOnly: z.boolean().optional().describe("Only products with 10 or fewer units"),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: read,
    },
    async (args) => tools.list_products(args),
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product",
      description: "Full product detail including every color/size SKU and its stock.",
      inputSchema: { idOrSlug: z.string().describe("Product id or slug") },
      annotations: read,
    },
    async (args) => tools.get_product(args),
  );

  server.registerTool(
    "list_orders",
    {
      title: "List orders",
      description: "Recent orders, newest first. Filter by fulfilment status or search id/name/email.",
      inputSchema: {
        status: z.enum(["all", "pending", "paid", "shipped", "cancelled"]).optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: read,
    },
    async (args) => tools.list_orders(args),
  );

  server.registerTool(
    "get_order",
    {
      title: "Get order",
      description: "One order with items, address, discount, shipping and payment state.",
      inputSchema: { orderId: z.string().describe("e.g. DRP-XXXXXXX") },
      annotations: read,
    },
    async (args) => tools.get_order(args),
  );

  server.registerTool(
    "list_customers",
    {
      title: "List customers",
      description: "Registered customers with order count, lifetime spend and account state.",
      inputSchema: {
        query: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: read,
    },
    async (args) => tools.list_customers(args),
  );

  server.registerTool(
    "list_discounts",
    {
      title: "List discounts",
      description: "All discount codes with usage, limits and active state.",
      inputSchema: {},
      annotations: read,
    },
    async () => tools.list_discounts(),
  );

  server.registerTool(
    "check_discount",
    {
      title: "Check a discount code",
      description: "Dry-run a code against a subtotal without redeeming it. Amounts in USD.",
      inputSchema: {
        code: z.string(),
        subtotal: z.number().describe("Cart subtotal in USD, e.g. 168"),
        email: z.string().email().optional().describe("Customer email, to check the per-customer limit"),
      },
      annotations: read,
    },
    async (args) => tools.check_discount(args),
  );

  server.registerTool(
    "update_variant_stock",
    {
      title: "Update variant stock",
      description: "Set the stock for one SKU. Product total stock is recalculated automatically.",
      inputSchema: {
        sku: z.string().describe("Variant SKU, e.g. VOLTRUNNER-VOLTRED-7"),
        stock: z.number().int().min(0),
      },
      annotations: write,
    },
    async (args) => tools.update_variant_stock(args),
  );

  server.registerTool(
    "set_product_status",
    {
      title: "Set product status",
      description: "Publish, unpublish (draft) or archive a product.",
      inputSchema: {
        idOrSlug: z.string(),
        status: z.enum(["draft", "active", "archived"]),
      },
      annotations: write,
    },
    async (args) => tools.set_product_status(args),
  );

  server.registerTool(
    "update_order_status",
    {
      title: "Update order status",
      description:
        "Move an order between pending/paid/shipped/cancelled. Cancelling restores stock exactly once.",
      inputSchema: {
        orderId: z.string(),
        status: z.enum(["pending", "paid", "shipped", "cancelled"]),
      },
      annotations: write,
    },
    async (args) => tools.update_order_status(args),
  );

  server.registerTool(
    "ship_order",
    {
      title: "Ship order",
      description: "Mark an order shipped with a carrier and tracking number.",
      inputSchema: {
        orderId: z.string(),
        carrier: z.string().optional(),
        trackingNumber: z.string().min(1),
      },
      annotations: write,
    },
    async (args) => tools.ship_order(args),
  );

  server.registerTool(
    "refund_order",
    {
      title: "Refund order",
      description: "Refund a paid order. Irreversible — confirm with the user first.",
      inputSchema: { orderId: z.string() },
      annotations: destructive,
    },
    async (args) => tools.refund_order(args),
  );

  server.registerTool(
    "create_discount",
    {
      title: "Create discount",
      description:
        "Create a percentage or fixed-amount code. value is percent for 'percentage', USD for 'fixed'.",
      inputSchema: {
        code: z.string().describe("A-Z, 0-9, - or _"),
        type: z.enum(["percentage", "fixed"]),
        value: z.number().positive(),
        minSubtotal: z.number().min(0).optional().describe("Minimum cart subtotal in USD"),
        usageLimit: z.number().int().positive().optional(),
        endsAt: z.string().optional().describe("ISO date, e.g. 2026-12-31"),
      },
      annotations: write,
    },
    async (args) => tools.create_discount(args),
  );

  server.registerTool(
    "set_customer_disabled",
    {
      title: "Enable or disable a customer",
      description: "Disable blocks sign-in and ends sessions. Order history is kept.",
      inputSchema: { email: z.string().email(), disabled: z.boolean() },
      annotations: write,
    },
    async (args) => tools.set_customer_disabled(args),
  );

  server.registerTool(
    "reset_customer_password",
    {
      title: "Reset a customer password",
      description: "Sets a temporary password and signs the customer out everywhere.",
      inputSchema: { email: z.string().email(), newPassword: z.string().min(8) },
      annotations: destructive,
    },
    async (args) => tools.reset_customer_password(args),
  );

  server.registerTool(
    "create_mcp_token",
    {
      title: "Create an MCP token",
      description: "Owner only. Returns a new token once — it cannot be retrieved later.",
      inputSchema: {
        name: z.string().min(2).describe("Label for this client, e.g. 'Claude Desktop'"),
        ownerEmail: z.string().email(),
      },
      annotations: write,
    },
    async (args) => tools.create_mcp_token(args),
  );

  server.registerTool(
    "revoke_mcp_token",
    {
      title: "Revoke an MCP token",
      description: "Owner only. Takes effect immediately.",
      inputSchema: { prefix: z.string().describe("Token prefix shown in the admin, e.g. drop_mcp_ab12cd") },
      annotations: destructive,
    },
    async (args) => tools.revoke_mcp_token(args),
  );

  return server;
}
