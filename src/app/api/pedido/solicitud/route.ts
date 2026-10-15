import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { orderEvents, supportRequests } from "@/db/schema";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { findOrderByToken } from "@/lib/orders/access";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  number: z.string().max(20),
  token: z.string().max(100),
  type: z.enum(["incidencia", "devolucion", "reembolso"]),
  message: z.string().trim().min(10).max(1500),
});

/** Solicitudes del cliente sobre su pedido (devolución, reembolso, incidencia). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "Origen no permitido.");
  if (!(await rateLimit(`solicitud:${await clientIp()}`, 5, 3600))) return jsonError(429, "Demasiadas solicitudes. Intenta más tarde.");
  let parsed;
  try {
    parsed = schema.safeParse(await readJson(req));
  } catch {
    return jsonError(400, "Solicitud inválida.");
  }
  if (!parsed.success) return jsonError(400, "Revisa tu mensaje (mínimo 10 caracteres).");
  const order = await findOrderByToken(parsed.data.number, parsed.data.token);
  if (!order) return jsonError(404, "No pudimos validar el pedido.");
  await db.transaction(async (tx) => {
    await tx.insert(supportRequests).values({ orderId: order.id, type: parsed.data.type, name: order.customerName, email: order.email, phone: order.phone, message: parsed.data.message });
    await tx.insert(orderEvents).values({ orderId: order.id, type: "solicitud_cliente", message: `Solicitud de ${parsed.data.type} recibida.`, visibleToCustomer: true });
  });
  return NextResponse.json({ ok: true });
}
