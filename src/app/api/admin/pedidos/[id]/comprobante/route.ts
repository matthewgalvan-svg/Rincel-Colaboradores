import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, receipts } from "@/db/schema";
import { ForbiddenError, requirePermission } from "@/lib/auth/guard";
import { renderReceiptPdf, type ReceiptData } from "@/lib/orders/receipt";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("orders.read");
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response("No autorizado", { status: 403 });
    throw err;
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("No encontrado", { status: 404 });
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  const [r] = o ? await db.select().from(receipts).where(eq(receipts.orderId, id)).limit(1) : [];
  if (!o || !r) return new Response("No encontrado", { status: 404 });
  const pdf = await renderReceiptPdf(r.data as unknown as ReceiptData);
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="comprobante-${o.number}.pdf"`, "Cache-Control": "private, no-store" } });
}
