import { NextResponse } from "next/server";
import { z } from "zod";
import { CLIENT_EVENTS } from "@/lib/analytics/events";
import { recordEvent } from "@/lib/analytics/server";
import { readJson, sameOrigin } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  name: z.enum(CLIENT_EVENTS),
  sessionId: z.string().max(64).nullable().optional(),
  path: z.string().max(200).optional(),
  productId: z.string().max(80).optional(),
  ctaId: z.string().max(80).optional(),
  valueCents: z.number().int().min(0).max(10_000_000).optional(),
  device: z.enum(["mobile", "tablet", "desktop"]).optional(),
  attribution: z.record(z.string().max(40), z.string().max(120)).optional(),
  meta: z.record(z.string().max(40), z.union([z.string().max(80), z.number(), z.boolean()])).optional(),
});

/** Ingesta de eventos propios. Solo nombres permitidos: "purchase" no se acepta desde el navegador. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 204 });
  if (!(await rateLimit(`eventos:${await clientIp()}`, 240, 600))) return new NextResponse(null, { status: 204 });
  try {
    const parsed = schema.safeParse(await readJson(req, 8_000));
    if (parsed.success) {
      const d = parsed.data;
      // El path nunca debe llevar tokens privados del pedido.
      const path = d.path?.startsWith("/pedido") ? "/pedido/[privado]" : d.path;
      await recordEvent({
        name: d.name,
        sessionId: d.sessionId,
        path,
        productId: d.productId,
        ctaId: d.ctaId,
        valueCents: d.valueCents,
        device: d.device,
        utmSource: d.attribution?.utm_source,
        utmMedium: d.attribution?.utm_medium,
        utmCampaign: d.attribution?.utm_campaign,
        referrerHost: d.attribution?.referrer_host,
        meta: d.meta,
      });
    }
  } catch {
    /* la medición nunca devuelve errores al navegador */
  }
  return new NextResponse(null, { status: 204 });
}
