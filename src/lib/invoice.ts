import PDFDocument from "pdfkit";
import { prisma } from "./db";
import { getSettings } from "./store-settings";
import { getCurrency, formatCurrency, convert, DEFAULT_CURRENCY } from "./currency";

type OrderForInvoice = {
  id: string;
  email: string;
  name: string;
  address: string;
  city: string;
  region: string | null;
  country: string;
  subtotal: number;
  shipping: number;
  taxAmount: number;
  taxRate: number;
  taxLabel: string | null;
  discountCode: string | null;
  discountAmount: number;
  total: number;
  currency: string;
  fxRate: number;
  createdAt: Date;
  paymentMethod: string | null;
  paymentStatus: string;
  items: Array<{
    name: string;
    sku: string | null;
    color: string;
    size: string;
    quantity: number;
    price: number;
  }>;
};

/** Allocates the next invoice number atomically so concurrent downloads can't collide. */
export async function nextInvoiceNumber() {
  const settings = await prisma.storeSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: { invoiceNextNumber: { increment: 1 } },
  });
  return `${settings.invoicePrefix}-${settings.invoiceNextNumber}`;
}

export async function invoiceNumberFor(orderId: string) {
  const existing = await prisma.invoice.findUnique({ where: { orderId } });
  if (existing) return existing.number;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");

  const number = await nextInvoiceNumber();
  await prisma.invoice.create({ data: { orderId, number, issuedAt: new Date() } });
  return number;
}

export async function buildInvoicePdf(orderId: string): Promise<{ pdf: Buffer; filename: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new Error("Order not found");

  const settings = await getSettings();
  const number = await invoiceNumberFor(orderId);
  const currency = (await getCurrency(order.currency)) ?? DEFAULT_CURRENCY;
  const fmt = (base: number) => formatCurrency(convert(base, order.fxRate || 1), currency);

  const pdf = await renderInvoice(order as OrderForInvoice, {
    number,
    storeName: "DROP",
    showTaxId: settings.invoiceShowTaxId,
    fmt,
  });

  return { pdf, filename: `${number}.pdf` };
}

function renderInvoice(
  order: OrderForInvoice,
  opts: { number: string; storeName: string; showTaxId: boolean; fmt: (n: number) => string },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 50;
    const right = 545;

    doc.font("Helvetica-Bold").fontSize(24).text(opts.storeName, left, 50);
    doc.font("Helvetica").fontSize(9).fillColor("#666");
    doc.text("Sneakers, bags & streetwear", left, 80);

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#000").text("INVOICE", 400, 50, { width: 145, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#666");
    doc.text(opts.number, 400, 72, { width: 145, align: "right" });
    doc.text(order.createdAt.toLocaleDateString("en-US"), 400, 86, { width: 145, align: "right" });

    doc.fillColor("#000").font("Helvetica-Bold").fontSize(9).text("BILLED TO", left, 130);
    doc.font("Helvetica").fontSize(9).fillColor("#333");
    doc.text(order.name, left, 145);
    doc.text(order.email, left, 158);
    doc.text(order.address, left, 171);
    doc.text(
      [order.city, order.region, order.country].filter(Boolean).join(", "),
      left,
      184,
    );

    doc.font("Helvetica-Bold").fillColor("#000").text("ORDER", 400, 130, { width: 145, align: "right" });
    doc.font("Helvetica").fillColor("#333").text(order.id, 400, 145, { width: 145, align: "right" });
    doc.text(`Payment: ${order.paymentMethod ?? "—"} (${order.paymentStatus})`, 400, 158, {
      width: 145,
      align: "right",
    });

    // Table header
    let y = 220;
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#ddd").stroke();
    y += 8;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text("ITEM", left, y);
    doc.text("QTY", 350, y, { width: 40, align: "right" });
    doc.text("PRICE", 400, y, { width: 65, align: "right" });
    doc.text("TOTAL", 470, y, { width: 75, align: "right" });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#ddd").stroke();
    y += 8;

    doc.font("Helvetica").fontSize(9).fillColor("#333");
    for (const item of order.items) {
      const label = `${item.name}`;
      const meta = [item.color, item.size, item.sku].filter(Boolean).join(" · ");
      doc.fillColor("#333").text(label, left, y, { width: 250 });
      doc.fillColor("#777").fontSize(8).text(meta, left, y + 11, { width: 250 });
      doc.fillColor("#333").fontSize(9);
      doc.text(String(item.quantity), 350, y, { width: 40, align: "right" });
      doc.text(opts.fmt(item.price), 400, y, { width: 65, align: "right" });
      doc.text(opts.fmt(item.price * item.quantity), 470, y, { width: 75, align: "right" });
      y += 30;
    }

    y += 4;
    doc.moveTo(300, y).lineTo(right, y).strokeColor("#ddd").stroke();
    y += 10;

    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(bold ? "#000" : "#555");
      doc.text(label, 300, y, { width: 150, align: "right" });
      doc.fillColor(bold ? "#000" : "#333").text(value, 470, y, { width: 75, align: "right" });
      y += 16;
    };

    row("Subtotal", opts.fmt(order.subtotal));
    if (order.discountAmount > 0) {
      row(`Discount${order.discountCode ? ` (${order.discountCode})` : ""}`, `-${opts.fmt(order.discountAmount)}`);
    }
    row(order.shipping === 0 ? "Shipping (free)" : "Shipping", opts.fmt(order.shipping));
    if (order.taxAmount > 0) {
      const rate = (order.taxRate / 100).toFixed(2).replace(/\.?0+$/, "");
      row(`${order.taxLabel ?? "Tax"} (${rate}%)`, opts.fmt(order.taxAmount));
    }

    y += 2;
    doc.moveTo(300, y).lineTo(right, y).strokeColor("#000").lineWidth(1).stroke();
    y += 10;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000");
    doc.text("TOTAL", 300, y, { width: 150, align: "right" });
    doc.text(opts.fmt(order.total), 470, y, { width: 75, align: "right" });

    doc.font("Helvetica").fontSize(8).fillColor("#999");
    doc.text(
      opts.showTaxId
        ? "Thank you for your order. Tax shown is calculated at the destination of record."
        : "Thank you for your order.",
      left,
      760,
      { width: 495, align: "center" },
    );

    doc.end();
  });
}
