import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { simulatedProviderOrders } from "@/db/schema";
import { hmacSha256Hex, safeEqual } from "@/lib/security/tokens";
import { mapMpStatus } from "./mercadopago";
import type { CheckoutSession, CreateCheckoutInput, PaymentGateway, ProviderOrderState, WebhookInput } from "./types";

/**
 * Pasarela SIMULADA para desarrollo y pruebas automatizadas. Imita la forma
 * de la API de Orders (estados processed/action_required/failed…) para
 * ejercitar exactamente el mismo flujo de confirmación. Bloqueada en producción.
 */
export const SIMULATED_WEBHOOK_SECRET = "simulated-webhook-secret-dev-only";
export const SIMULATED_RECEIVER_ID = "SIMULADO-RECEPTOR";

export function simulatedGateway(appUrl: string): PaymentGateway {
  return {
    id: "simulated",
    environment: "simulated",
    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
      const existing = await db.select().from(simulatedProviderOrders).where(eq(simulatedProviderOrders.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing[0]) return { providerOrderId: existing[0].id, checkoutUrl: `${appUrl}/pago-simulado/${existing[0].id}` };
      const id = `SIMORD${randomBytes(6).toString("hex").toUpperCase()}`;
      await db.insert(simulatedProviderOrders).values({
        id,
        idempotencyKey: input.idempotencyKey,
        externalReference: input.orderNumber,
        totalCents: input.totalCents,
        status: "created",
        statusDetail: "created",
        returnUrls: input.returnUrls,
      });
      return { providerOrderId: id, checkoutUrl: `${appUrl}/pago-simulado/${id}` };
    },
    async getOrder(providerOrderId: string): Promise<ProviderOrderState> {
      const [o] = await db.select().from(simulatedProviderOrders).where(eq(simulatedProviderOrders.id, providerOrderId)).limit(1);
      if (!o) throw new Error("Orden simulada inexistente.");
      const hasTx = o.status !== "created";
      return {
        providerOrderId: o.id,
        status: mapMpStatus(o.status, o.statusDetail, hasTx),
        rawStatus: o.status,
        rawStatusDetail: o.statusDetail,
        externalReference: o.externalReference,
        totalAmountCents: o.overrideAmountCents ?? o.totalCents,
        paidAmountCents: o.status === "processed" ? (o.overrideAmountCents ?? o.totalCents) : 0,
        currency: o.overrideCurrency ?? "MXN",
        countryCode: "MEX",
        receiverId: o.overrideReceiverId ?? SIMULATED_RECEIVER_ID,
        liveMode: false,
        transactions: hasTx
          ? [
              {
                id: `${o.id}-PAY`,
                status: mapMpStatus(o.status, o.statusDetail),
                rawStatus: o.status,
                rawStatusDetail: o.statusDetail,
                amountCents: o.totalCents,
                paidAmountCents: o.status === "processed" ? o.totalCents : null,
                refundedAmountCents: o.refundedCents,
                paymentMethodId: o.paymentMethodId,
                paymentType: o.paymentType,
                dateOfExpiration: o.status === "action_required" ? new Date(Date.now() + 48 * 3600_000) : null,
              },
            ]
          : [],
      };
    },
    async refund({ providerOrderId, amountCents }) {
      const [o] = await db.select().from(simulatedProviderOrders).where(eq(simulatedProviderOrders.id, providerOrderId)).limit(1);
      if (!o || o.status !== "processed") return { providerRefundId: null, status: "rejected" };
      const amount = amountCents ?? o.totalCents - o.refundedCents;
      const refunded = Math.min(o.totalCents, o.refundedCents + amount);
      await db
        .update(simulatedProviderOrders)
        .set({ refundedCents: refunded, statusDetail: refunded >= o.totalCents ? "refunded" : "partially_refunded", status: refunded >= o.totalCents ? "refunded" : "processed" })
        .where(eq(simulatedProviderOrders.id, providerOrderId));
      return { providerRefundId: `SIMREF${randomBytes(4).toString("hex").toUpperCase()}`, status: "approved" };
    },
    verifyWebhook(input: WebhookInput) {
      const requestId = input.headers.get("x-request-id");
      const sig = input.headers.get("x-signature") ?? "";
      const id = input.query.get("data.id") ?? "";
      const expected = hmacSha256Hex(SIMULATED_WEBHOOK_SECRET, `id:${id.toLowerCase()};request-id:${requestId ?? ""};`);
      if (!safeEqual(expected, sig)) return { valid: false, reason: "Firma inválida.", requestId };
      return { valid: true, topic: "order", action: "order.updated", resourceId: id, requestId, liveMode: false };
    },
  };
}
