import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { activations, orderEvents, orders, refunds, shipments } from "@/db/schema";
import { recordEvent } from "@/lib/analytics/server";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/guard";
import type { ActivationStatus, FulfillmentStatus, ShippingStatus } from "@/lib/domain/types";
import { SHIPPING_STATUS_LABELS } from "@/lib/domain/types";
import { env } from "@/lib/env";
import { adjustStock, releaseOrderReservations } from "@/lib/inventory/service";
import { enqueueNotification, processNotifications } from "@/lib/notifications";
import { orderPrivateUrl } from "@/lib/orders/access";
import { getGateway } from "@/lib/payments";
import { syncProviderOrder } from "@/lib/payments/sync";
import { getSettings } from "@/lib/settings";
import { addShipmentEvent } from "@/lib/shipping/service";
import { saveFile } from "@/lib/storage";
import { inventoryMovements } from "@/db/schema";

export class OpError extends Error {}

type Actor = Pick<StaffUser, "id" | "email" | "role">;

async function loadOrder(orderId: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) throw new OpError("Pedido inexistente.");
  return o;
}

/** Bloqueo común: no se prepara ni envía nada sin pago aprobado y sin revisión pendiente. */
function assertShippable(o: typeof orders.$inferSelect) {
  if (o.paymentStatus !== "approved") throw new OpError("El pedido no tiene un pago aprobado.");
  if (o.reviewRequired) throw new OpError("El pedido tiene una anomalía pendiente de revisión.");
  if (o.fulfillmentStatus === "cancelled" || o.fulfillmentStatus === "on_hold") throw new OpError("El pedido está cancelado o detenido.");
}

export async function setFulfillmentStatus(orderId: string, status: FulfillmentStatus, actor: Actor) {
  const o = await loadOrder(orderId);
  if (status === "preparing" || status === "ready") assertShippable(o);
  if (status === "on_hold" && !["pending", "preparing", "ready"].includes(o.fulfillmentStatus)) throw new OpError("Solo se puede detener un pedido en preparación.");
  await db.transaction(async (tx) => {
    await tx.update(orders).set({ fulfillmentStatus: status }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, type: "preparacion", message: `Preparación: ${status}.`, actorUserId: actor.id, visibleToCustomer: status === "preparing" || status === "ready" });
    await audit({ actor, action: "pedido.preparacion", entity: "order", entityId: orderId, before: { fulfillmentStatus: o.fulfillmentStatus }, after: { fulfillmentStatus: status } }, tx);
  });
}

/** Registra una guía capturada manualmente (una sola por envío). */
export async function registerManualLabel(orderId: string, input: { carrier: string; trackingNumber: string; trackingUrl?: string | null; labelPdf?: { data: Buffer; filename: string } | null }, actor: Actor) {
  const o = await loadOrder(orderId);
  assertShippable(o);
  if (!o.requiresShipping) throw new OpError("El pedido no requiere envío.");
  if (input.trackingUrl && !/^https:\/\//.test(input.trackingUrl)) throw new OpError("El enlace de rastreo debe iniciar con https://");
  let fileId: string | null = null;
  if (input.labelPdf) fileId = (await saveFile({ kind: "guia", data: input.labelPdf.data, filename: input.labelPdf.filename, mimeType: "application/pdf", orderId, uploadedBy: actor.id, isPrivate: true })).id;
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(shipments).where(eq(shipments.orderId, orderId)).for("update");
    if (!s) throw new OpError("No existe el envío del pedido.");
    if (s.trackingNumber) throw new OpError("Este envío ya tiene una guía. Una guía por envío.");
    await tx
      .update(shipments)
      .set({ carrier: input.carrier, trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl ?? null, labelFileId: fileId, status: "label_created", lastError: null })
      .where(eq(shipments.id, s.id));
    await tx.update(orders).set({ shippingStatus: "label_created" }).where(eq(orders.id, orderId));
    await addShipmentEvent(tx, s.id, "label_created", `Guía ${input.trackingNumber} creada con ${input.carrier}. Aún no ha sido recolectada.`, "manual");
    await audit({ actor, action: "envio.guia_manual", entity: "order", entityId: orderId, after: { carrier: input.carrier, trackingNumber: input.trackingNumber } }, tx);
  });
}

const SHIP_FLOW: ShippingStatus[] = ["pending", "label_created", "picked_up", "in_transit", "delivered"];

/** Actualiza el estado de envío con datos reales reportados por la paquetería. */
export async function recordShipmentUpdate(orderId: string, input: { status: ShippingStatus; description: string; occurredAt?: Date }, actor: Actor) {
  const o = await loadOrder(orderId);
  if (!["picked_up", "in_transit", "delivered", "incident", "returned", "cancelled"].includes(input.status)) throw new OpError("Estado de envío no permitido.");
  if (input.status !== "cancelled") assertShippable(o);
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(shipments).where(eq(shipments.orderId, orderId)).for("update");
    if (!s) throw new OpError("No existe el envío.");
    if (["picked_up", "in_transit", "delivered"].includes(input.status) && !s.trackingNumber) throw new OpError("Primero registra la guía.");
    if (SHIP_FLOW.indexOf(input.status) !== -1 && SHIP_FLOW.indexOf(input.status) < SHIP_FLOW.indexOf(s.status)) throw new OpError("El envío ya está en una etapa posterior.");
    await tx.update(shipments).set({ status: input.status }).where(eq(shipments.id, s.id));
    await tx.update(orders).set({ shippingStatus: input.status, ...(input.status === "delivered" ? { fulfillmentStatus: "ready" as const } : {}) }).where(eq(orders.id, orderId));
    await addShipmentEvent(tx, s.id, input.status, input.description || SHIPPING_STATUS_LABELS[input.status], "manual", input.occurredAt ?? new Date());
    await enqueueNotification(tx, {
      orderId,
      template: "envio_actualizado",
      recipient: o.email,
      payload: { orderNumber: o.number, customerName: o.customerName, statusLabel: SHIPPING_STATUS_LABELS[input.status], tracking: s.trackingNumber, sellerName: settings.sellerName, orderUrl: orderPrivateUrl(env().APP_URL, o) },
      dedupKey: `order:${orderId}:ship:${input.status}:${Date.now()}`,
    });
    await audit({ actor, action: "envio.estado", entity: "order", entityId: orderId, before: { shippingStatus: s.status }, after: { shippingStatus: input.status } }, tx);
  });
  void processNotifications({ orderId }).catch(() => undefined);
}

function aggregateActivation(statuses: ActivationStatus[]): ActivationStatus {
  if (!statuses.length) return "not_required";
  if (statuses.every((s) => s === "cancelled")) return "cancelled";
  const live = statuses.filter((s) => s !== "cancelled");
  if (live.some((s) => s === "incident")) return "incident";
  if (live.every((s) => s === "activated")) return "activated";
  if (live.some((s) => s === "in_progress" || s === "activated")) return "in_progress";
  return "pending";
}

export async function updateActivation(activationId: string, input: { status: ActivationStatus; assignedTo?: string | null; internalNote?: string | null }, actor: Actor) {
  const [a] = await db.select().from(activations).where(eq(activations.id, activationId)).limit(1);
  if (!a) throw new OpError("Activación inexistente.");
  const o = await loadOrder(a.orderId);
  if (o.paymentStatus !== "approved" && input.status !== "cancelled") throw new OpError("No se activa una línea sin pago aprobado.");
  if (o.reviewRequired && input.status === "activated") throw new OpError("Resuelve la revisión del pedido antes de activar.");
  await db.transaction(async (tx) => {
    await tx
      .update(activations)
      .set({ status: input.status, assignedTo: input.assignedTo ?? a.assignedTo, internalNote: input.internalNote ?? a.internalNote })
      .where(eq(activations.id, activationId));
    const all = await tx.select({ status: activations.status }).from(activations).where(eq(activations.orderId, a.orderId));
    const agg = aggregateActivation(all.map((x) => x.status));
    await tx.update(orders).set({ activationStatus: agg }).where(eq(orders.id, a.orderId));
    await tx.insert(orderEvents).values({ orderId: a.orderId, type: "activacion", message: `Línea ${a.lineIndex + 1}: ${input.status}.`, actorUserId: actor.id, visibleToCustomer: input.status === "activated" || input.status === "in_progress" });
    await audit({ actor, action: "activacion.estado", entity: "activation", entityId: activationId, before: { status: a.status }, after: { status: input.status } }, tx);
  });
}

/** Archivo eSIM privado; solo se libera al cliente cuando el personal lo indica. */
export async function attachEsim(activationId: string, file: { data: Buffer; filename: string; mimeType: string }, actor: Actor) {
  const [a] = await db.select().from(activations).where(eq(activations.id, activationId)).limit(1);
  if (!a) throw new OpError("Activación inexistente.");
  if (a.simType !== "esim") throw new OpError("Esta línea no es eSIM.");
  const o = await loadOrder(a.orderId);
  if (o.paymentStatus !== "approved") throw new OpError("El pedido no tiene pago aprobado.");
  const saved = await saveFile({ kind: "esim", data: file.data, filename: file.filename, mimeType: file.mimeType, orderId: a.orderId, uploadedBy: actor.id, isPrivate: true });
  await db.update(activations).set({ esimFileId: saved.id, esimAvailableToCustomer: false }).where(eq(activations.id, activationId));
  await audit({ actor, action: "activacion.esim_cargada", entity: "activation", entityId: activationId, after: { fileId: saved.id } });
}

export async function setEsimAvailability(activationId: string, available: boolean, actor: Actor) {
  const [a] = await db.select().from(activations).where(eq(activations.id, activationId)).limit(1);
  if (!a?.esimFileId) throw new OpError("Primero carga el archivo de eSIM.");
  const o = await loadOrder(a.orderId);
  if (available && (o.paymentStatus !== "approved" || o.reviewRequired)) throw new OpError("No se libera una eSIM sin pago aprobado o con revisión pendiente.");
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    await tx.update(activations).set({ esimAvailableToCustomer: available }).where(eq(activations.id, activationId));
    if (available) {
      await enqueueNotification(tx, {
        orderId: o.id,
        template: "esim_lista",
        recipient: o.email,
        payload: { orderNumber: o.number, customerName: o.customerName, sellerName: settings.sellerName, orderUrl: orderPrivateUrl(env().APP_URL, o) },
        dedupKey: `order:${o.id}:esim:${activationId}`,
      });
    }
    await audit({ actor, action: available ? "activacion.esim_liberada" : "activacion.esim_retirada", entity: "activation", entityId: activationId }, tx);
  });
  void processNotifications({ orderId: o.id }).catch(() => undefined);
}

export async function assignOrder(orderId: string, userId: string | null, actor: Actor) {
  const o = await loadOrder(orderId);
  await db.update(orders).set({ assignedTo: userId }).where(eq(orders.id, orderId));
  await audit({ actor, action: "pedido.responsable", entity: "order", entityId: orderId, before: { assignedTo: o.assignedTo }, after: { assignedTo: userId } });
}

export async function addInternalNote(orderId: string, note: string, actor: Actor) {
  if (note.trim().length < 2) throw new OpError("Escribe la nota.");
  await loadOrder(orderId);
  await db.insert(orderEvents).values({ orderId, type: "nota_interna", message: note.trim().slice(0, 2000), actorUserId: actor.id, visibleToCustomer: false });
}

export async function resolveReview(orderId: string, note: string, actor: Actor) {
  if (actor.role !== "admin") throw new OpError("Solo un administrador puede resolver anomalías.");
  const o = await loadOrder(orderId);
  if (!o.reviewRequired) throw new OpError("El pedido no tiene revisión pendiente.");
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ reviewRequired: false, reviewReason: null, fulfillmentStatus: o.fulfillmentStatus === "on_hold" && o.paymentStatus === "approved" ? (o.requiresShipping ? "pending" : "not_required") : o.fulfillmentStatus })
      .where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, type: "revision_resuelta", message: `Revisión resuelta: ${note.trim().slice(0, 500)}`, actorUserId: actor.id });
    await audit({ actor, action: "pedido.revision_resuelta", entity: "order", entityId: orderId, before: { reviewReason: o.reviewReason }, after: { note } }, tx);
  });
}

/** Cancela un pedido sin pago acreditado y libera inventario. */
export async function cancelOpenOrder(orderId: string, reason: string, actor: Actor) {
  if (actor.role !== "admin") throw new OpError("Solo un administrador puede cancelar pedidos.");
  const o = await loadOrder(orderId);
  if (!["pending", "in_process", "rejected"].includes(o.paymentStatus)) throw new OpError("Solo se cancelan pedidos sin pago acreditado. Para pedidos pagados usa un reembolso.");
  await db.transaction(async (tx) => {
    await releaseOrderReservations(tx, orderId, "released");
    await tx
      .update(orders)
      .set({ paymentStatus: "cancelled", cancelledAt: new Date(), fulfillmentStatus: "cancelled", shippingStatus: o.requiresShipping ? "cancelled" : "not_required", activationStatus: o.activationStatus === "not_required" ? "not_required" : "cancelled" })
      .where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, type: "cancelado", message: "Pedido cancelado.", actorUserId: actor.id, visibleToCustomer: true, data: { reason } });
    await audit({ actor, action: "pedido.cancelado", entity: "order", entityId: orderId, before: { paymentStatus: o.paymentStatus }, after: { reason } }, tx);
  });
}

/** Solicitud de reembolso (personal). La ejecución real la hace un administrador. */
export async function requestRefund(orderId: string, input: { amountCents: number; reason: string }, actor: Actor) {
  const o = await loadOrder(orderId);
  if (!["approved", "partially_refunded"].includes(o.paymentStatus)) throw new OpError("Solo se reembolsan pedidos pagados.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > o.totalCents) throw new OpError("Importe inválido.");
  const prior = await db.select().from(refunds).where(and(eq(refunds.orderId, orderId), inArray(refunds.status, ["requested", "processing", "approved"])));
  const committed = prior.reduce((s, r) => s + r.amountCents, 0);
  if (committed + input.amountCents > o.totalCents) throw new OpError("El reembolso excede lo pagado.");
  const [r] = await db
    .insert(refunds)
    .values({ orderId, amountCents: input.amountCents, reason: input.reason.slice(0, 500), status: "requested", idempotencyKey: `refund-${randomUUID()}`, requestedBy: actor.id })
    .returning();
  await audit({ actor, action: "reembolso.solicitado", entity: "refund", entityId: r.id, after: { orderId, amountCents: input.amountCents } });
  return r;
}

/**
 * Ejecuta el reembolso con la operación real del proveedor (no solo una
 * etiqueta local). Opcionalmente devuelve existencias si la mercancía regresó.
 */
export async function executeRefund(refundId: string, opts: { restock: boolean }, actor: Actor) {
  if (actor.role !== "admin") throw new OpError("Solo un administrador puede ejecutar reembolsos.");
  const [r] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  if (!r) throw new OpError("Reembolso inexistente.");
  if (r.status !== "requested" && r.status !== "failed") throw new OpError("Este reembolso ya se procesó.");
  const o = await loadOrder(r.orderId);
  if (!o.providerOrderId) throw new OpError("El pedido no tiene orden en el proveedor.");
  if (opts.restock && r.amountCents < o.totalCents) throw new OpError("En reembolsos parciales ajusta el inventario manualmente desde Inventario.");
  await db.update(refunds).set({ status: "processing" }).where(eq(refunds.id, refundId));
  const gateway = getGateway();
  try {
    const partial = r.amountCents < o.totalCents;
    const state = partial ? await gateway.getOrder(o.providerOrderId) : null;
    const txId = state?.transactions.find((t) => t.status === "approved" || t.status === "partially_refunded")?.id;
    const res = await gateway.refund({ providerOrderId: o.providerOrderId, transactionId: partial ? txId : undefined, amountCents: partial ? r.amountCents : undefined, idempotencyKey: r.idempotencyKey });
    await db.update(refunds).set({ status: res.status === "approved" ? "approved" : res.status === "rejected" ? "rejected" : "processing", providerRefundId: res.providerRefundId, error: null }).where(eq(refunds.id, refundId));
    if (res.status === "approved") {
      await recordEvent({ name: "refund", orderId: o.id, valueCents: r.amountCents, isTest: o.isTest, meta: { refundId } });
    }
    if (opts.restock && res.status !== "rejected") {
      const sold = await db.select().from(inventoryMovements).where(and(eq(inventoryMovements.orderId, o.id), eq(inventoryMovements.reason, "venta")));
      await db.transaction(async (tx) => {
        for (const m of sold) await adjustStock(tx, { componentId: m.componentId, delta: -m.delta, reason: "devolucion", userId: actor.id, orderId: o.id, note: `Devolución por reembolso ${refundId}` });
      });
    }
    await audit({ actor, action: "reembolso.ejecutado", entity: "refund", entityId: refundId, after: { status: res.status, restock: opts.restock } });
    await syncProviderOrder({ orderId: o.id, source: "manual" }).catch(() => undefined);
    return res.status;
  } catch (err) {
    await db.update(refunds).set({ status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "Error" }).where(eq(refunds.id, refundId));
    throw new OpError(`El proveedor no procesó el reembolso: ${err instanceof Error ? err.message : "error"}`);
  }
}
