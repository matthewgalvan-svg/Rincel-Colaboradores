import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { recordEvent } from "@/lib/analytics/server";
import { cartInputSchema, priceCart } from "@/lib/cart/pricing";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { getSettings } from "@/lib/settings";
import { quoteShipping, ShippingError } from "@/lib/shipping/service";

const schema = z.object({
  lines: cartInputSchema,
  postalCode: z.string().trim(),
  state: z.string().trim().max(60).optional(),
  municipality: z.string().trim().max(80).optional(),
  sessionId: z.string().max(64).nullable().optional(),
});

/** Cotiza el envío ANTES del pago y guarda servicio, costo, ID y vigencia. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "Origen no permitido.");
  if (!(await rateLimit(`cotizar:${await clientIp()}`, 30, 600))) return jsonError(429, "Demasiadas cotizaciones. Espera unos minutos.");
  let parsed;
  try {
    parsed = schema.safeParse(await readJson(req));
  } catch {
    return jsonError(400, "Solicitud inválida.");
  }
  if (!parsed.success) return jsonError(400, "Revisa el código postal y tu carrito.");
  const input = parsed.data;
  const settings = await getSettings();
  const priced = await priceCart(db, input.lines, { maxQuantityPerItem: settings.checkout.maxQuantityPerItem });
  if (!priced.requiresShipping) return NextResponse.json({ ok: true, required: false, options: [] });
  try {
    const options = await quoteShipping({ postalCode: input.postalCode, state: input.state, municipality: input.municipality, cartHash: priced.shippingCartHash, items: priced.physicalComponents });
    await recordEvent({ name: "shipping_quote", sessionId: input.sessionId, meta: { options: options.length } });
    return NextResponse.json({ ok: true, required: true, cartHash: priced.shippingCartHash, options }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const code = err instanceof ShippingError ? err.code : "provider_error";
    const message = err instanceof ShippingError ? err.message : "No pudimos cotizar el envío. Intenta de nuevo.";
    await recordEvent({ name: "shipping_quote_error", sessionId: input.sessionId, meta: { code } });
    return jsonError(code === "invalid_postal_code" ? 400 : 422, message, { code });
  }
}
