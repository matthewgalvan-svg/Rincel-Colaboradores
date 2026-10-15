import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderEvents, orders, shipments } from "@/db/schema";
import { expireReservations, releaseOrderReservations } from "@/lib/inventory/service";
import { processNotifications } from "@/lib/notifications";
import { paymentsAvailable } from "@/lib/payments";
import { syncProviderOrder } from "@/lib/payments/sync";
import { getSettings } from "@/lib/settings";
import { createLabelForOrder, resolveShippingProvider } from "@/lib/shipping/service";

export interface JobReport {
  expiredReservations: number;
  expiredOrders: number;
  reconciled: number;
  reconcileErrors: number;
  labels: { created: number; failed: number };
  notifications: { processed: number; sent: number };
}

/** Vence un pedido abierto (sin pago acreditado) y libera su inventario. */
async function expireOpenOrder(orderId: string) {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o || !["pending", "rejected"].includes(o.paymentStatus)) return false;
    await releaseOrderReservations(tx, o.id, "expired");
    await tx
      .update(orders)
      .set({
        paymentStatus: "expired",
        fulfillmentStatus: "cancelled",
        shippingStatus: o.requiresShipping ? "cancelled" : "not_required",
        activationStatus: o.activationStatus === "not_required" ? "not_required" : "cancelled",
      })
      .where(eq(orders.id, o.id));
    await tx.insert(orderEvents).values({ orderId: o.id, type: "pago_vencido", message: "El tiempo para pagar terminó y se liberó el inventario apartado.", visibleToCustomer: true });
    return true;
  });
}

/**
 * Trabajos periódicos (ejecutar cada 5–10 minutos con `npm run jobs` o
 * POST /api/cron con CRON_SECRET): vencimientos, conciliación con el
 * proveedor, reintento de guías y envío de notificaciones.
 */
export async function runJobs(now = new Date()): Promise<JobReport> {
  const report: JobReport = { expiredReservations: 0, expiredOrders: 0, reconciled: 0, reconcileErrors: 0, labels: { created: 0, failed: 0 }, notifications: { processed: 0, sent: 0 } };
  const canSync = paymentsAvailable().ok;

  // 1) Conciliación: recupera notificaciones perdidas consultando al proveedor.
  if (canSync) {
    const open = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          inArray(orders.paymentStatus, ["pending", "in_process", "rejected"]),
          isNotNull(orders.providerOrderId),
          gt(orders.createdAt, new Date(now.getTime() - 10 * 24 * 3600_000)),
          lt(orders.updatedAt, new Date(now.getTime() - 2 * 60_000)),
        ),
      )
      .limit(50);
    for (const o of open) {
      try {
        await syncProviderOrder({ orderId: o.id, source: "conciliacion" });
        report.reconciled++;
      } catch {
        report.reconcileErrors++;
      }
    }
  }

  // 2) Reservas vencidas → pedidos abiertos sin pago se vencen.
  const affected = await expireReservations(db, now);
  report.expiredReservations = affected.length;
  const candidates = await db
    .select({ id: orders.id, paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(and(inArray(orders.paymentStatus, ["pending", "rejected"]), lt(orders.reservationExpiresAt, now)))
    .limit(200);
  for (const c of candidates) {
    if (await expireOpenOrder(c.id)) report.expiredOrders++;
  }

  // 3) Guías pendientes (solo si el administrador habilitó la creación automática).
  const settings = await getSettings();
  const provider = resolveShippingProvider(settings);
  if (settings.shipping.autoCreateLabels && provider?.createLabel) {
    const pendingShipments = await db
      .select({ orderId: shipments.orderId })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(
        and(
          eq(shipments.status, "pending"),
          isNull(shipments.trackingNumber),
          lt(shipments.labelAttempts, 5),
          eq(orders.paymentStatus, "approved"),
          eq(orders.reviewRequired, false),
          sql`${orders.fulfillmentStatus} not in ('on_hold','cancelled')`,
        ),
      )
      .limit(20);
    for (const s of pendingShipments) {
      const r = await createLabelForOrder(s.orderId);
      if (r.status === "created") report.labels.created++;
      if (r.status === "failed") report.labels.failed++;
    }
  }

  // 4) Bandeja de salida de correos.
  report.notifications = await processNotifications({ limit: 100 });
  return report;
}
