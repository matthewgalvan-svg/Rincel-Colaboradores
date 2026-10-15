import { NextResponse } from "next/server";
import { db } from "@/db";
import { cartInputSchema, priceCart } from "@/lib/cart/pricing";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { publicImage } from "@/lib/catalog/facts";
import { getSettings } from "@/lib/settings";

/** Valora el carrito con precios y existencias del servidor (para mostrar totales reales). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "Origen no permitido.");
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return jsonError(400, "Solicitud inválida.");
  }
  const lines = cartInputSchema.safeParse((body as { lines?: unknown }).lines);
  if (!lines.success) return NextResponse.json({ ok: true, lines: [], subtotalCents: 0, requiresShipping: false, hasDigital: false, issues: [], shippingCartHash: null });
  const settings = await getSettings();
  const priced = await priceCart(db, lines.data, { maxQuantityPerItem: settings.checkout.maxQuantityPerItem });
  return NextResponse.json(
    {
      ok: true,
      lines: priced.lines.map((l) => {
        const img = publicImage(l.product);
        return {
          productId: l.product.id,
          variantCode: l.variant.code,
          name: l.product.name,
          variantLabel: l.variant.label,
          delivery: l.delivery,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          lineTotalCents: l.lineTotalCents,
          priceNote: l.product.priceNote,
          linesPerUnit: l.product.linesPerUnit,
          category: l.product.category,
          thumb: img ? img.src.replace(/\.webp$/, "-480.webp") : null,
        };
      }),
      subtotalCents: priced.subtotalCents,
      requiresShipping: priced.requiresShipping,
      hasDigital: priced.hasDigital,
      shippingCartHash: priced.shippingCartHash,
      issues: priced.issues,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
