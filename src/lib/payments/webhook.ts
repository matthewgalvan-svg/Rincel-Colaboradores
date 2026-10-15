import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { getGateway } from "./index";
import { syncProviderOrder } from "./sync";
import type { PaymentGateway, WebhookInput } from "./types";

export interface WebhookResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Recibe una notificación: valida firma, deduplica por x-request-id, consulta
 * el estado real y responde 200 rápido. Errores transitorios → 500 para que
 * el proveedor reintente; la conciliación periódica cubre lo que se pierda.
 */
export async function handlePaymentWebhook(input: WebhookInput, gatewayArg?: PaymentGateway): Promise<WebhookResponse> {
  const gateway = gatewayArg ?? getGateway();
  const v = gateway.verifyWebhook(input);
  if (!v.valid) {
    await db
      .insert(webhookEvents)
      .values({ provider: gateway.id, requestId: null, signatureValid: false, status: "rejected", error: v.reason })
      .catch(() => undefined);
    return { status: 401, body: { error: "firma inválida" } };
  }

  let eventId: string;
  const inserted = await db
    .insert(webhookEvents)
    .values({ provider: gateway.id, requestId: v.requestId, topic: v.topic, action: v.action, resourceId: v.resourceId, signatureValid: true, liveMode: v.liveMode, status: "received" })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted[0]) {
    eventId = inserted[0].id;
  } else {
    const [prev] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.provider, gateway.id), eq(webhookEvents.requestId, v.requestId ?? "")))
      .limit(1);
    if (!prev) return { status: 500, body: { error: "estado inconsistente" } };
    if (prev.status === "processed" || prev.status === "ignored") return { status: 200, body: { ok: true, duplicate: true } };
    eventId = prev.id;
  }

  const finish = (status: string, error?: string) =>
    db
      .update(webhookEvents)
      .set({ status, error: error ?? null, processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
      .where(eq(webhookEvents.id, eventId));

  const topic = (v.topic ?? "").toLowerCase();
  if (!["order", "orders"].includes(topic) || !v.resourceId) {
    await finish("ignored", `Tópico no manejado: ${v.topic ?? "desconocido"}`);
    return { status: 200, body: { ok: true, ignored: true } };
  }
  if (v.liveMode !== null && (gateway.environment === "production") !== v.liveMode) {
    await finish("ignored", "Notificación de un entorno distinto (pruebas vs. producción).");
    return { status: 200, body: { ok: true, ignored: true } };
  }

  try {
    const outcome = await syncProviderOrder({ providerOrderId: v.resourceId, source: "webhook" }, gateway);
    await finish(outcome.result === "ignored" || outcome.result === "not_found" ? "ignored" : "processed", "reason" in outcome ? outcome.reason : undefined);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "Error", attempts: sql`${webhookEvents.attempts} + 1` })
      .where(eq(webhookEvents.id, eventId));
    return { status: 500, body: { error: "reintentar" } };
  }
}
