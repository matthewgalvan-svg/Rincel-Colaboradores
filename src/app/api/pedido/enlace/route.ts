import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { env } from "@/lib/env";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { enqueueNotification, processNotifications } from "@/lib/notifications";
import { orderPrivateUrl } from "@/lib/orders/access";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { getSettings } from "@/lib/settings";

const schema = z.object({ number: z.string().trim().toUpperCase().max(20), email: z.email().max(160) });

/**
 * Reenvía el enlace privado al correo del pedido. La respuesta es siempre la
 * misma para no revelar si un número o correo existen.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "Origen no permitido.");
  if (!(await rateLimit(`enlace:${await clientIp()}`, 5, 900))) return jsonError(429, "Demasiados intentos. Espera unos minutos.");
  let parsed;
  try {
    parsed = schema.safeParse(await readJson(req));
  } catch {
    return jsonError(400, "Solicitud inválida.");
  }
  if (!parsed.success) return jsonError(400, "Escribe tu número de pedido y tu correo.");
  const { number, email } = parsed.data;
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.number, number), eq(orders.email, email.toLowerCase())))
    .limit(1);
  if (order && (await rateLimit(`enlace-pedido:${order.id}`, 3, 3600))) {
    const settings = await getSettings();
    await enqueueNotification(db, {
      orderId: order.id,
      template: "enlace_pedido",
      recipient: order.email,
      payload: { orderNumber: order.number, sellerName: settings.sellerName, orderUrl: orderPrivateUrl(env().APP_URL, order) },
      dedupKey: `order:${order.id}:link:${Date.now()}`,
    });
    void processNotifications({ orderId: order.id }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, message: "Si los datos coinciden con un pedido, enviaremos el enlace privado a ese correo en unos minutos." });
}
