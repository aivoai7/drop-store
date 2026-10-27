import { getAdminUser } from "@/lib/auth";
import { buildInvoicePdf } from "@/lib/invoice";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const { id } = await context.params;

  try {
    const { pdf, filename } = await buildInvoicePdf(id);
    await recordAudit({
      actor: admin,
      action: "order.invoice.downloaded",
      target: id,
      ip: await clientIp(),
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not build invoice";
    return new Response(message, { status: 404 });
  }
}
