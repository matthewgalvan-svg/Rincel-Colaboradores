import "server-only";
import { createHash } from "node:crypto";
import { db, type DbOrTx } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { env } from "@/lib/env";
import type { AnalyticsEventName } from "./events";

export interface AnalyticsInput {
  name: AnalyticsEventName;
  sessionId?: string | null;
  orderId?: string | null;
  productId?: string | null;
  ctaId?: string | null;
  path?: string | null;
  valueCents?: number | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrerHost?: string | null;
  device?: string | null;
  isTest?: boolean;
  meta?: Record<string, string | number | boolean> | null;
}

const clip = (v: string | null | undefined, n = 120) => (v ? v.slice(0, n) : null);

/** Registra un evento propio (sin correo, teléfono ni domicilio). */
export async function recordEvent(input: AnalyticsInput, tx: DbOrTx = db): Promise<boolean> {
  const rows = await tx
    .insert(analyticsEvents)
    .values({
      name: input.name,
      sessionId: clip(input.sessionId, 64),
      orderId: input.orderId ?? null,
      productId: clip(input.productId, 80),
      ctaId: clip(input.ctaId, 80),
      path: clip(input.path, 200),
      valueCents: input.valueCents ?? null,
      utmSource: clip(input.utmSource, 80),
      utmMedium: clip(input.utmMedium, 80),
      utmCampaign: clip(input.utmCampaign, 120),
      referrerHost: clip(input.referrerHost, 120),
      device: clip(input.device, 20),
      isTest: input.isTest ?? env().APP_ENV !== "production",
      meta: input.meta ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: analyticsEvents.id });
  return rows.length > 0;
}

/**
 * Envía la compra a GA4 (Measurement Protocol) y Meta (Conversions API) SOLO
 * desde el servidor, una vez por pedido y con consentimiento. El navegador
 * nunca envía "purchase", así no se duplica.
 */
export async function forwardPurchase(order: { number: string; totalCents: number; analyticsConsent: boolean; analyticsSessionId: string | null; isTest: boolean }, items: { productId: string; productName: string; unitPriceCents: number; quantity: number }[]) {
  const e = env();
  if (!order.analyticsConsent || order.isTest) return;
  const value = order.totalCents / 100;
  const tasks: Promise<unknown>[] = [];
  if (e.GA4_MEASUREMENT_ID && e.GA4_API_SECRET && order.analyticsSessionId) {
    tasks.push(
      fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(e.GA4_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(e.GA4_API_SECRET)}`, {
        method: "POST",
        body: JSON.stringify({
          client_id: order.analyticsSessionId,
          events: [
            {
              name: "purchase",
              params: {
                transaction_id: order.number,
                currency: "MXN",
                value,
                items: items.map((i) => ({ item_id: i.productId, item_name: i.productName, price: i.unitPriceCents / 100, quantity: i.quantity })),
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      }),
    );
  }
  if (e.META_PIXEL_ID && e.META_CAPI_TOKEN && order.analyticsSessionId) {
    tasks.push(
      fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(e.META_PIXEL_ID)}/events?access_token=${encodeURIComponent(e.META_CAPI_TOKEN)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            {
              event_name: "Purchase",
              event_time: Math.floor(Date.now() / 1000),
              event_id: order.number,
              action_source: "website",
              // Solo un identificador seudónimo de sesión; sin correo ni teléfono.
              user_data: { external_id: [createHash("sha256").update(order.analyticsSessionId).digest("hex")] },
              custom_data: { currency: "MXN", value, order_id: order.number },
            },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      }),
    );
  }
  await Promise.allSettled(tasks);
}
