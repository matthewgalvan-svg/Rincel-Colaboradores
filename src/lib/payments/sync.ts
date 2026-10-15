import "server-only";
import { eq, or } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { activations, orderEvents, orderItems, orders, payments, shipments, shippingQuotes } from "@/db/schema";
import { forwardPurchase, recordEvent } from "@/lib/analytics/server";
import type { PaymentStatus } from "@/lib/domain/types";
import { env } from "@/lib/env";
import { commitOrderInventory, extendReservations, releaseOrderReservations } from "@/lib/inventory/service";
import { formatMXN } from "@/lib/money";
import { enqueueNotification, processNotifications } from "@/lib/notifications";
import { orderPrivateUrl } from "@/lib/orders/access";
import { issueReceipt, paymentTypeLabel, type ReceiptData } from "@/lib/orders/receipt";
import { getSettings } from "@/lib/settings";
import { createLabelForOrder, resolveShippingProvider } from "@/lib/shipping/service";
import { expectedReceiverId, getGateway } from "./index";
import type { PaymentGateway, ProviderOrderState } from "./types";

type OrderRow = typeof orders.$inferSelect;

export type SyncOutcome =
  | { result: "updated" | "unchanged"; orderId: string; paymentStatus: PaymentStatus }
  | { result: "review"; orderId: string; reason: string }
  | { result: "not_found" | "ignored"; reason: string };

const PAID_LIKE: PaymentStatus[] = ["approved", "partially_refunded", "refunded", "charged_back"];
const OPEN: PaymentStatus[] = ["pending", "in_process", "rejected"];

/** Verifica que el cobro corresponda a este pedido, a nuestra cuenta, al importe y a la moneda. */
export function correlationProblems(order: Pick<OrderRow, "number" | "totalCents">, state: ProviderOrderState, receiverId: string | null, requireReceiver: boolean): string[] {
  const problems: string[] = [];
  if (state.externalReference !== order.number) problems.push(`Referencia externa distinta (${state.externalReference ?? "vacía"}).`);
  if (requireReceiver && !receiverId) problems.push("No hay cuenta receptora configurada para verificar.");
  if (receiverId && state.receiverId !== receiverId) problems.push("La cuenta receptora no coincide con la configurada.");
  if (state.totalAmountCents !== null && state.totalAmountCents !== order.totalCents) problems.push(`Importe del proveedor (${formatMXN(state.totalAmountCents)}) distinto al del pedido (${formatMXN(order.totalCents)}).`);
  if (state.status === "approved" && state.paidAmountCents !== null && state.paidAmountCents < order.totalCents) problems.push("El importe pagado es menor al total del pedido.");
  if (state.currency ? state.currency !== "MXN" : state.countryCode !== null && state.countryCode !== "MEX") problems.push(`Moneda o país inesperado (${state.currency ?? state.countryCode}).`);
  if (state.status === "approved" && state.totalAmountCents === null && state.paidAmountCents === null) problems.push("El proveedor no informó importe.");
  return problems;
}

async function upsertPayments(tx: DbOrTx, order: OrderRow, state: ProviderOrderState, provider: string) {
  for (const t of state.transactions) {
    await tx
      .insert(payments)
      .values({
        orderId: order.id,
        provider,
        providerOrderId: state.providerOrderId,
        providerPaymentId: t.id,
        status: t.status,
        rawStatus: t.rawStatus,
        rawStatusDetail: t.rawStatusDetail,
        amountCents: t.amountCents ?? order.totalCents,
        paidAmountCents: t.paidAmountCents,
        refundedAmountCents: t.refundedAmountCents ?? 0,
        currency: state.currency,
        paymentMethodId: t.paymentMethodId,
        paymentType: t.paymentType,
        receiverId: state.receiverId,
        liveMode: state.liveMode,
        dateOfExpiration: t.dateOfExpiration,
        approvedAt: t.status === "approved" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [payments.provider, payments.providerPaymentId],
        set: {
          status: t.status,
          rawStatus: t.rawStatus,
          rawStatusDetail: t.rawStatusDetail,
          paidAmountCents: t.paidAmountCents,
          refundedAmountCents: t.refundedAmountCents ?? 0,
          paymentMethodId: t.paymentMethodId,
          paymentType: t.paymentType,
          dateOfExpiration: t.dateOfExpiration,
          updatedAt: new Date(),
        },
      });
  }
}

async function event(tx: DbOrTx, orderId: string, type: string, message: string, visibleToCustomer = false, data?: Record<string, unknown>) {
  await tx.insert(orderEvents).values({ orderId, type, message, visibleToCustomer, data: data ?? null });
}

/** Efectos de un pago aprobado. Cada paso es idempotente. */
async function markPaid(tx: DbOrTx, order: OrderRow, state: ProviderOrderState, provider: string): Promise<{ purchaseRecorded: boolean; review: string | null }> {
  const now = new Date();
  const settings = await getSettings(tx);
  let review: string | null = null;
  if (order.cancelledAt) review = "Pago aprobado en un pedido cancelado: decidir reembolso o reactivación.";

  const commit = await commitOrderInventory(tx, order.id, now);
  if (!commit.ok) {
    review = `Pago aprobado sin existencias suficientes (${commit.shortages.map((s) => `${s.componentId}: faltan ${s.requested - s.available}`).join(", ")}). No despachar sin revisión.`;
  }

  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const needsActivation = items.filter((i) => ["portabilidad", "linea_nueva", "datos"].includes(i.category));
  for (const item of needsActivation) {
    const lines = Math.max(1, item.linesPerUnit) * item.quantity;
    const kind = item.category === "portabilidad" ? "portabilidad" : item.category === "linea_nueva" ? "linea_nueva" : "datos";
    for (let i = 0; i < lines; i++) {
      await tx
        .insert(activations)
        .values({ orderId: order.id, orderItemId: item.id, lineIndex: i, kind, simType: item.simType ?? "fisico", status: "pending" })
        .onConflictDoNothing();
    }
  }

  if (order.requiresShipping) {
    const [quote] = order.shippingQuoteId ? await tx.select().from(shippingQuotes).where(eq(shippingQuotes.id, order.shippingQuoteId)).limit(1) : [];
    await tx
      .insert(shipments)
      .values({
        orderId: order.id,
        quoteId: order.shippingQuoteId,
        provider: quote?.provider ?? "manual",
        serviceCode: quote?.serviceCode ?? null,
        serviceName: quote?.serviceName ?? order.shippingMethodLabel,
        costCents: order.shippingCents,
        status: "pending",
        labelIdempotencyKey: `label-${order.id}`,
      })
      .onConflictDoNothing();
  }

  const hasPhysical = order.requiresShipping;
  await tx
    .update(orders)
    .set({
      paymentStatus: "approved",
      paidAt: order.paidAt ?? now,
      fulfillmentStatus: review ? "on_hold" : hasPhysical ? "pending" : "not_required",
      shippingStatus: hasPhysical ? "pending" : "not_required",
      activationStatus: needsActivation.length ? "pending" : "not_required",
      reviewRequired: review ? true : order.reviewRequired,
      reviewReason: review ?? order.reviewReason,
    })
    .where(eq(orders.id, order.id));

  const primary = state.transactions.find((t) => t.status === "approved") ?? state.transactions[0];
  const receipt: ReceiptData = {
    sellerName: settings.sellerName,
    receiptNumber: `CMP-${order.number.slice(3)}`,
    orderNumber: order.number,
    issuedAt: now.toISOString(),
    paidAt: (order.paidAt ?? now).toISOString(),
    customerName: order.customerName,
    items: items.map((i) => ({ name: i.productName, variant: i.variantLabel, quantity: i.quantity, unitPriceCents: i.unitPriceCents, lineTotalCents: i.lineTotalCents })),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    shippingLabel: order.shippingMethodLabel,
    totalCents: order.totalCents,
    currency: "MXN",
    paymentProvider: provider === "mercadopago" ? "Mercado Pago" : "Pasarela simulada",
    paymentReference: primary?.id ?? state.providerOrderId,
    paymentMethod: paymentTypeLabel(primary?.paymentType),
    isTest: order.isTest,
  };
  await issueReceipt(tx, order.id, receipt);
  await event(tx, order.id, "pago_aprobado", "Pago aprobado. Comprobante disponible.", true, { provider, reference: receipt.paymentReference });
  if (review) await event(tx, order.id, "revision", review);

  const e = env();
  await enqueueNotification(tx, {
    orderId: order.id,
    template: "pago_aprobado",
    recipient: order.email,
    payload: { orderNumber: order.number, customerName: order.customerName, totalCents: order.totalCents, sellerName: settings.sellerName, orderUrl: orderPrivateUrl(e.APP_URL, order) },
    dedupKey: `order:${order.id}:paid`,
  });
  if (review && settings.contact.email) {
    await enqueueNotification(tx, { orderId: order.id, template: "alerta_admin", recipient: settings.contact.email, payload: { orderNumber: order.number, title: "Pedido pagado requiere revisión", message: review }, dedupKey: `order:${order.id}:review-paid` });
  }

  const purchaseRecorded = await recordEvent(
    { name: "purchase", orderId: order.id, sessionId: order.analyticsSessionId, valueCents: order.totalCents, device: order.deviceType, isTest: order.isTest, utmSource: order.attribution.utm_source, utmMedium: order.attribution.utm_medium, utmCampaign: order.attribution.utm_campaign },
    tx,
  );
  return { purchaseRecorded, review };
}

/**
 * Consulta el estado real en el proveedor (nunca confía en parámetros de
 * retorno ni en el cuerpo del webhook) y aplica la transición correspondiente.
 * Soporta notificaciones duplicadas y fuera de orden: siempre se aplica el
 * estado vigente del proveedor y cada efecto es idempotente.
 */
export async function syncProviderOrder(params: { providerOrderId?: string; orderId?: string; source: "webhook" | "retorno" | "conciliacion" | "manual" }, gatewayArg?: PaymentGateway): Promise<SyncOutcome> {
  const gateway = gatewayArg ?? getGateway();
  let order: OrderRow | undefined;
  if (params.orderId) [order] = await db.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
  const providerOrderId = params.providerOrderId ?? order?.providerOrderId ?? null;
  if (!providerOrderId) return { result: "not_found", reason: "El pedido no tiene sesión de pago." };

  const state = await gateway.getOrder(providerOrderId);
  if (!order) {
    [order] = await db
      .select()
      .from(orders)
      .where(or(eq(orders.providerOrderId, providerOrderId), state.externalReference ? eq(orders.number, state.externalReference) : undefined))
      .limit(1);
  }
  if (!order) return { result: "not_found", reason: "No existe un pedido para esta orden del proveedor." };
  if (order.paymentProvider !== gateway.id || order.paymentEnvironment !== gateway.environment) {
    return { result: "ignored", reason: "La orden pertenece a otro proveedor o entorno (pruebas vs. producción)." };
  }
  if (order.providerOrderId && order.providerOrderId !== providerOrderId) {
    return { result: "ignored", reason: "La orden del proveedor no corresponde a la registrada en el pedido." };
  }

  const receiver = expectedReceiverId(gateway);
  const requireReceiver = gateway.environment === "production";
  let purchase: { recorded: boolean; order: OrderRow } | null = null;
  let reviewForLabel = false;

  const outcome = await db.transaction(async (tx): Promise<SyncOutcome> => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, order!.id)).for("update");
    const current = locked!;
    if (!current.providerOrderId) await tx.update(orders).set({ providerOrderId }).where(eq(orders.id, current.id));
    await upsertPayments(tx, current, state, gateway.id);

    const prev = current.paymentStatus;
    const next = state.status;
    const problems = correlationProblems(current, state, receiver, requireReceiver);
    if (problems.length && next !== "pending" && next !== "rejected" && next !== "cancelled" && next !== "expired") {
      const reason = `No se confirmó el pago por inconsistencias: ${problems.join(" ")}`;
      if (current.reviewReason !== reason) {
        await tx.update(orders).set({ reviewRequired: true, reviewReason: reason, fulfillmentStatus: "on_hold" }).where(eq(orders.id, current.id));
        await event(tx, current.id, "revision", reason, false, { source: params.source, providerStatus: state.rawStatus });
      }
      return { result: "review", orderId: current.id, reason };
    }

    if (next === prev) return { result: "unchanged", orderId: current.id, paymentStatus: prev };
    const settings = await getSettings(tx);

    switch (next) {
      case "approved": {
        if (PAID_LIKE.includes(prev)) return { result: "unchanged", orderId: current.id, paymentStatus: prev };
        const r = await markPaid(tx, current, state, gateway.id);
        purchase = { recorded: r.purchaseRecorded, order: current };
        reviewForLabel = Boolean(r.review);
        break;
      }
      case "in_process": {
        if (!OPEN.includes(prev)) return { result: "unchanged", orderId: current.id, paymentStatus: prev };
        const maxUntil = new Date(Date.now() + settings.checkout.pendingPaymentMaxHours * 3600_000);
        const providerUntil = state.transactions.map((t) => t.dateOfExpiration).find(Boolean) ?? null;
        const until = providerUntil && providerUntil < maxUntil ? providerUntil : maxUntil;
        await extendReservations(tx, current.id, until);
        await tx.update(orders).set({ paymentStatus: "in_process", reservationExpiresAt: until }).where(eq(orders.id, current.id));
        await event(tx, current.id, "pago_en_proceso", "Pago en proceso. Se confirma al acreditarse.", true, { rawStatus: state.rawStatus, rawStatusDetail: state.rawStatusDetail });
        await enqueueNotification(tx, {
          orderId: current.id,
          template: "pago_pendiente",
          recipient: current.email,
          payload: { orderNumber: current.number, customerName: current.customerName, sellerName: settings.sellerName, orderUrl: orderPrivateUrl(env().APP_URL, current) },
          dedupKey: `order:${current.id}:pending`,
        });
        await recordEvent({ name: "payment_pending", orderId: current.id, sessionId: current.analyticsSessionId, isTest: current.isTest }, tx);
        break;
      }
      case "rejected": {
        if (!OPEN.includes(prev)) return { result: "unchanged", orderId: current.id, paymentStatus: prev };
        // Se conserva la reserva hasta su vencimiento para permitir reintentar el pago.
        await tx.update(orders).set({ paymentStatus: "rejected" }).where(eq(orders.id, current.id));
        await event(tx, current.id, "pago_rechazado", "El pago fue rechazado. Puedes intentar de nuevo con otro medio.", true, { rawStatusDetail: state.rawStatusDetail });
        await recordEvent({ name: "payment_rejected", orderId: current.id, sessionId: current.analyticsSessionId, isTest: current.isTest }, tx);
        break;
      }
      case "cancelled":
      case "expired": {
        if (!OPEN.includes(prev)) {
          if (PAID_LIKE.includes(prev)) {
            const reason = `El proveedor reporta "${next}" en un pedido ya pagado.`;
            await tx.update(orders).set({ reviewRequired: true, reviewReason: reason }).where(eq(orders.id, current.id));
            await event(tx, current.id, "revision", reason);
            return { result: "review", orderId: current.id, reason };
          }
          return { result: "unchanged", orderId: current.id, paymentStatus: prev };
        }
        await releaseOrderReservations(tx, current.id, next === "expired" ? "expired" : "released");
        await tx
          .update(orders)
          .set({
            paymentStatus: next,
            fulfillmentStatus: "cancelled",
            shippingStatus: current.requiresShipping ? "cancelled" : "not_required",
            activationStatus: current.activationStatus === "not_required" ? "not_required" : "cancelled",
          })
          .where(eq(orders.id, current.id));
        await event(tx, current.id, next === "expired" ? "pago_vencido" : "pago_cancelado", next === "expired" ? "El plazo de pago venció." : "El pago fue cancelado.", true);
        break;
      }
      case "refunded":
      case "partially_refunded": {
        await tx.update(orders).set({ paymentStatus: next }).where(eq(orders.id, current.id));
        await event(tx, current.id, "reembolso", next === "refunded" ? "Pago reembolsado." : "Reembolso parcial registrado.", true);
        break;
      }
      case "charged_back": {
        const reason = "Contracargo reportado por el proveedor. Detener envío/activación y revisar.";
        await tx
          .update(orders)
          .set({ paymentStatus: "charged_back", reviewRequired: true, reviewReason: reason, fulfillmentStatus: current.shippingStatus === "pending" ? "on_hold" : current.fulfillmentStatus })
          .where(eq(orders.id, current.id));
        await event(tx, current.id, "contracargo", reason);
        break;
      }
      case "pending":
        return { result: "unchanged", orderId: current.id, paymentStatus: prev };
    }
    return { result: "updated", orderId: current.id, paymentStatus: next };
  });

  // Efectos externos fuera de la transacción (reintentos los cubren los trabajos programados).
  if (outcome.result === "updated" || outcome.result === "review") {
    void processNotifications({ orderId: order.id }).catch(() => undefined);
  }
  const p = purchase as { recorded: boolean; order: OrderRow } | null;
  if (p?.recorded) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    void forwardPurchase(p.order, items).catch(() => undefined);
  }
  if (outcome.result === "updated" && outcome.paymentStatus === "approved" && !reviewForLabel) {
    const settings = await getSettings();
    const provider = resolveShippingProvider(settings);
    if (settings.shipping.autoCreateLabels && provider?.createLabel) {
      await createLabelForOrder(order.id).catch(() => undefined);
    }
  }
  return outcome;
}
