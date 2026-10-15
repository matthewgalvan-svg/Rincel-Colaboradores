import { eq } from "drizzle-orm";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { findOrderByToken } from "@/lib/orders/access";
import { renderReceiptPdf, type ReceiptData } from "@/lib/orders/receipt";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

/** PDF del comprobante (solo con enlace privado y pago aprobado). */
export async function GET(req: Request, { params }: { params: Promise<{ numero: string }> }) {
  if (!(await rateLimit(`comprobante:${await clientIp()}`, 30, 600))) return new Response("Demasiadas solicitudes", { status: 429 });
  const { numero } = await params;
  const token = new URL(req.url).searchParams.get("t");
  const order = await findOrderByToken(decodeURIComponent(numero), token);
  if (!order) return new Response("No encontrado", { status: 404 });
  const [receipt] = await db.select().from(receipts).where(eq(receipts.orderId, order.id)).limit(1);
  if (!receipt) return new Response("Comprobante no disponible", { status: 404 });
  const pdf = await renderReceiptPdf(receipt.data as unknown as ReceiptData);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="comprobante-${order.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
