import { NextResponse } from "next/server";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { createOrderAndCheckout } from "@/lib/orders/checkout";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

/** Crea el pedido pendiente y la sesión de pago. El navegador solo envía qué y cuánto: los precios se calculan aquí. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "Origen no permitido.");
  if (!(await rateLimit(`checkout:${await clientIp()}`, 15, 600))) return jsonError(429, "Demasiados intentos. Espera unos minutos e intenta de nuevo.");
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return jsonError(400, "Solicitud inválida.");
  }
  try {
    const result = await createOrderAndCheckout(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 422, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("checkout_error", err instanceof Error ? err.message : "desconocido");
    return jsonError(500, "Ocurrió un error al crear tu pedido. Tus datos se conservaron; intenta de nuevo.");
  }
}
