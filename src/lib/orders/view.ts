import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activations, orderEvents, orderItems, orders, receipts, shipmentEvents, shipments } from "@/db/schema";
import { paymentsAvailable } from "@/lib/payments";
import { syncProviderOrder } from "@/lib/payments/sync";
import { rateLimit } from "@/lib/security/rate-limit";

type OrderRow = typeof orders.$inferSelect;

/** Refresca el estado del pago desde el proveedor (consulta de servidor, nunca parámetros de retorno). */
export async function refreshPaymentIfOpen(order: OrderRow): Promise<OrderRow> {
  if (!order.providerOrderId || !["pending", "in_process", "rejected"].includes(order.paymentStatus)) return order;
  if (!paymentsAvailable().ok) return order;
  if (!(await rateLimit(`refresh:${order.id}`, 1, 8))) return order;
  try {
    await syncProviderOrder({ orderId: order.id, source: "retorno" });
  } catch {
    /* si el proveedor no responde, se muestra el último estado conocido */
  }
  const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  return fresh ?? order;
}

/** Vista del pedido para el cliente: sin notas internas ni datos de otros clientes. */
export async function customerOrderView(orderId: string) {
  const [items, events, shipment, acts, receipt] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    db
      .select()
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.visibleToCustomer, true)))
      .orderBy(asc(orderEvents.createdAt)),
    db.select().from(shipments).where(eq(shipments.orderId, orderId)).limit(1),
    db.select().from(activations).where(eq(activations.orderId, orderId)).orderBy(asc(activations.createdAt), asc(activations.lineIndex)),
    db.select().from(receipts).where(eq(receipts.orderId, orderId)).limit(1),
  ]);
  const shipEvents = shipment[0] ? await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipment[0].id)).orderBy(desc(shipmentEvents.occurredAt)) : [];
  return {
    items,
    events,
    shipment: shipment[0] ?? null,
    shipmentEvents: shipEvents,
    activations: acts.map((a) => ({ id: a.id, kind: a.kind, simType: a.simType, status: a.status, esimAvailable: a.esimAvailableToCustomer && Boolean(a.esimFileId), lineIndex: a.lineIndex, orderItemId: a.orderItemId })),
    receipt: receipt[0] ?? null,
  };
}
