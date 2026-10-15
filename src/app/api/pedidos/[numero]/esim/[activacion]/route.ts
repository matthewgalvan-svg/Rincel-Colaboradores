import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activations, orderEvents } from "@/db/schema";
import { findOrderByToken } from "@/lib/orders/access";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { readStoredFile } from "@/lib/storage";

/** Descarga privada del archivo eSIM: requiere enlace privado y que el personal lo haya liberado. */
export async function GET(req: Request, { params }: { params: Promise<{ numero: string; activacion: string }> }) {
  if (!(await rateLimit(`esim:${await clientIp()}`, 10, 600))) return new Response("Demasiadas solicitudes", { status: 429 });
  const { numero, activacion } = await params;
  const token = new URL(req.url).searchParams.get("t");
  const order = await findOrderByToken(decodeURIComponent(numero), token);
  if (!order || !/^[0-9a-f-]{36}$/.test(activacion)) return new Response("No encontrado", { status: 404 });
  const [a] = await db
    .select()
    .from(activations)
    .where(and(eq(activations.id, activacion), eq(activations.orderId, order.id)))
    .limit(1);
  if (!a || !a.esimFileId || !a.esimAvailableToCustomer || order.paymentStatus !== "approved") return new Response("No disponible", { status: 404 });
  const stored = await readStoredFile(a.esimFileId);
  if (!stored) return new Response("No disponible", { status: 404 });
  await db.insert(orderEvents).values({ orderId: order.id, type: "esim_descargada", message: "El cliente descargó la información de eSIM.", data: { activationId: a.id } });
  return new Response(new Uint8Array(stored.data), {
    headers: {
      "Content-Type": stored.file.mimeType,
      "Content-Disposition": `attachment; filename="esim-${order.number}-${a.lineIndex + 1}.${stored.file.mimeType === "application/pdf" ? "pdf" : stored.file.mimeType.split("/")[1]}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
