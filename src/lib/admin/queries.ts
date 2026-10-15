import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activations,
  auditLog,
  authUser,
  files,
  inventoryComponents,
  inventoryReservations,
  notifications,
  orderEvents,
  orderItems,
  orders,
  payments,
  products,
  receipts,
  refunds,
  shipmentEvents,
  shipments,
  supportRequests,
  webhookEvents,
} from "@/db/schema";
import { commercialImageState } from "@/lib/catalog/facts";
import { componentAvailability } from "@/lib/inventory/service";

export interface OrderFilters {
  q?: string;
  payment?: string;
  shipping?: string;
  activation?: string;
  fulfillment?: string;
  review?: boolean;
  includeTest?: boolean;
  from?: Date;
  to?: Date;
  page?: number;
}

export function orderWhere(f: OrderFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (f.q) {
    const q = `%${f.q.trim()}%`;
    conds.push(or(ilike(orders.number, q), ilike(orders.email, q), ilike(orders.customerName, q), ilike(orders.phone, q)));
  }
  if (f.payment) conds.push(eq(orders.paymentStatus, f.payment as never));
  if (f.shipping) conds.push(eq(orders.shippingStatus, f.shipping as never));
  if (f.activation) conds.push(eq(orders.activationStatus, f.activation as never));
  if (f.fulfillment) conds.push(eq(orders.fulfillmentStatus, f.fulfillment as never));
  if (f.review) conds.push(eq(orders.reviewRequired, true));
  if (!f.includeTest) conds.push(eq(orders.isTest, false));
  if (f.from) conds.push(gte(orders.createdAt, f.from));
  if (f.to) conds.push(lte(orders.createdAt, f.to));
  return and(...conds);
}

export async function listOrders(f: OrderFilters, pageSize = 30) {
  const where = orderWhere(f);
  const page = Math.max(1, f.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function orderDetail(id: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const [items, events, pays, ship, acts, receipt, refundRows, notes, support, orderFiles] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(desc(orderEvents.createdAt)),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.createdAt)),
    db.select().from(shipments).where(eq(shipments.orderId, id)).limit(1),
    db.select().from(activations).where(eq(activations.orderId, id)).orderBy(asc(activations.createdAt), asc(activations.lineIndex)),
    db.select().from(receipts).where(eq(receipts.orderId, id)).limit(1),
    db.select().from(refunds).where(eq(refunds.orderId, id)).orderBy(desc(refunds.createdAt)),
    db.select().from(notifications).where(eq(notifications.orderId, id)).orderBy(desc(notifications.createdAt)),
    db.select().from(supportRequests).where(eq(supportRequests.orderId, id)).orderBy(desc(supportRequests.createdAt)),
    db.select().from(files).where(eq(files.orderId, id)),
  ]);
  const shipEvents = ship[0] ? await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, ship[0].id)).orderBy(desc(shipmentEvents.occurredAt)) : [];
  const reservations = await db.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, id));
  return { order, items, events, payments: pays, shipment: ship[0] ?? null, shipmentEvents: shipEvents, activations: acts, receipt: receipt[0] ?? null, refunds: refundRows, notifications: notes, support, files: orderFiles, reservations };
}

export async function staffUsers() {
  return db.select({ id: authUser.id, name: authUser.name, email: authUser.email, role: authUser.role, banned: authUser.banned, createdAt: authUser.createdAt }).from(authUser).orderBy(asc(authUser.name));
}

/** Alertas operativas del tablero. */
export async function dashboardAlerts() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [review, toPrepare, failedLabels, pendingActivations, openSupport, failedNotifications, failedWebhooks, availability, comps, prods] = await Promise.all([
    db.select({ n: count() }).from(orders).where(eq(orders.reviewRequired, true)),
    db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.paymentStatus, "approved"), eq(orders.fulfillmentStatus, "pending"), eq(orders.reviewRequired, false))),
    db
      .select({ n: count() })
      .from(shipments)
      .where(and(eq(shipments.status, "pending"), sql`${shipments.lastError} is not null`)),
    db
      .select({ n: count() })
      .from(activations)
      .where(inArray(activations.status, ["pending", "incident"])),
    db
      .select({ n: count() })
      .from(supportRequests)
      .where(inArray(supportRequests.status, ["abierta", "en_revision"])),
    db
      .select({ n: count() })
      .from(notifications)
      .where(inArray(notifications.status, ["failed", "skipped"])),
    db
      .select({ n: count() })
      .from(webhookEvents)
      .where(and(inArray(webhookEvents.status, ["failed", "rejected"]), gte(webhookEvents.receivedAt, since))),
    componentAvailability(db),
    db.select().from(inventoryComponents),
    db.select().from(products),
  ]);
  const lowStock = comps.filter((c) => (availability.get(c.id) ?? 0) <= c.lowStockThreshold).map((c) => ({ id: c.id, name: c.name, available: availability.get(c.id) ?? 0 }));
  const imageIssues = prods.filter((p) => p.status !== "archived" && commercialImageState(p) !== "ok").map((p) => ({ id: p.id, name: p.name, state: commercialImageState(p) }));
  return {
    review: review[0].n,
    toPrepare: toPrepare[0].n,
    failedLabels: failedLabels[0].n,
    pendingActivations: pendingActivations[0].n,
    openSupport: openSupport[0].n,
    failedNotifications: failedNotifications[0].n,
    failedWebhooks: failedWebhooks[0].n,
    lowStock,
    imageIssues,
  };
}

export async function recentAudit(limit = 200, entity?: string) {
  return db
    .select()
    .from(auditLog)
    .where(entity ? eq(auditLog.entity, entity) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function supportList(status?: string) {
  return db
    .select()
    .from(supportRequests)
    .where(status ? eq(supportRequests.status, status) : undefined)
    .orderBy(desc(supportRequests.createdAt))
    .limit(200);
}

export async function activationQueue() {
  return db
    .select({ a: activations, number: orders.number, customerName: orders.customerName, phone: orders.phone, paymentStatus: orders.paymentStatus, reviewRequired: orders.reviewRequired, isTest: orders.isTest })
    .from(activations)
    .innerJoin(orders, eq(orders.id, activations.orderId))
    .where(inArray(activations.status, ["pending", "in_progress", "incident"]))
    .orderBy(asc(activations.createdAt))
    .limit(200);
}

export async function shipmentQueue() {
  return db
    .select({ s: shipments, number: orders.number, orderId: orders.id, reviewRequired: orders.reviewRequired, fulfillmentStatus: orders.fulfillmentStatus, isTest: orders.isTest, paidAt: orders.paidAt })
    .from(shipments)
    .innerJoin(orders, eq(orders.id, shipments.orderId))
    .where(inArray(shipments.status, ["pending", "label_created", "picked_up", "in_transit", "incident"]))
    .orderBy(asc(shipments.createdAt))
    .limit(200);
}

