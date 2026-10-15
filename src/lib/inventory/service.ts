import "server-only";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { inventoryComponents, inventoryMovements, inventoryReservations, variantComponents } from "@/db/schema";

export class OutOfStockError extends Error {
  constructor(public shortages: { componentId: string; requested: number; available: number }[]) {
    super("No hay existencias suficientes para completar el pedido.");
    this.name = "OutOfStockError";
  }
}

export type ComponentNeeds = Map<string, number>;

/** Suma las necesidades de componentes de varias variantes × cantidad. */
export async function componentNeedsFor(tx: DbOrTx, lines: { variantId: string; quantity: number }[]): Promise<ComponentNeeds> {
  const needs: ComponentNeeds = new Map();
  if (!lines.length) return needs;
  const rows = await tx
    .select()
    .from(variantComponents)
    .where(
      inArray(
        variantComponents.variantId,
        lines.map((l) => l.variantId),
      ),
    );
  for (const line of lines) {
    for (const r of rows.filter((x) => x.variantId === line.variantId)) {
      needs.set(r.componentId, (needs.get(r.componentId) ?? 0) + r.quantity * line.quantity);
    }
  }
  return needs;
}

/** Existencias disponibles = en almacén − reservas activas vigentes. */
export async function componentAvailability(tx: DbOrTx, now = new Date(), excludeOrderId?: string): Promise<Map<string, number>> {
  const comps = await tx.select({ id: inventoryComponents.id, onHand: inventoryComponents.onHand }).from(inventoryComponents);
  const reservedRows = await tx
    .select({
      componentId: inventoryReservations.componentId,
      qty: sql<number>`coalesce(sum(${inventoryReservations.quantity}), 0)::int`,
    })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.status, "active"),
        gt(inventoryReservations.expiresAt, now),
        excludeOrderId ? sql`${inventoryReservations.orderId} <> ${excludeOrderId}` : undefined,
      ),
    )
    .groupBy(inventoryReservations.componentId);
  const reserved = new Map(reservedRows.map((r) => [r.componentId, Number(r.qty)]));
  return new Map(comps.map((c) => [c.id, c.onHand - (reserved.get(c.id) ?? 0)]));
}

/** Unidades vendibles por variante (null = sin componentes físicos, p. ej. eSIM). */
export async function variantAvailability(tx: DbOrTx, now = new Date()): Promise<Map<string, number | null>> {
  const avail = await componentAvailability(tx, now);
  const rows = await tx.select().from(variantComponents);
  const out = new Map<string, number | null>();
  const byVariant = new Map<string, { componentId: string; quantity: number }[]>();
  for (const r of rows) byVariant.set(r.variantId, [...(byVariant.get(r.variantId) ?? []), r]);
  for (const [variantId, comps] of byVariant) {
    let units = Infinity;
    for (const c of comps) units = Math.min(units, Math.floor(Math.max(0, avail.get(c.componentId) ?? 0) / c.quantity));
    out.set(variantId, units === Infinity ? null : units);
  }
  return out;
}

/** Bloquea filas de componentes en orden estable para evitar interbloqueos. */
async function lockComponents(tx: DbOrTx, ids: string[]) {
  if (!ids.length) return;
  const sorted = [...ids].sort();
  await tx.execute(sql`select id from ${inventoryComponents} where id in (${sql.join(sorted.map((id) => sql`${id}`), sql`, `)}) order by id for update`);
}

/**
 * Aparta existencias para un pedido pendiente de pago. Debe ejecutarse dentro
 * de una transacción: bloquea los componentes y verifica disponibilidad real.
 */
export async function reserveForOrder(tx: DbOrTx, orderId: string, needs: ComponentNeeds, expiresAt: Date, now = new Date()) {
  const ids = [...needs.keys()];
  if (!ids.length) return;
  await lockComponents(tx, ids);
  const avail = await componentAvailability(tx, now, orderId);
  const shortages = ids
    .map((id) => ({ componentId: id, requested: needs.get(id)!, available: Math.max(0, avail.get(id) ?? 0) }))
    .filter((s) => s.requested > s.available);
  if (shortages.length) throw new OutOfStockError(shortages);
  await tx.insert(inventoryReservations).values(ids.map((componentId) => ({ orderId, componentId, quantity: needs.get(componentId)!, status: "active" as const, expiresAt })));
}

export async function extendReservations(tx: DbOrTx, orderId: string, until: Date) {
  await tx
    .update(inventoryReservations)
    .set({ expiresAt: until, updatedAt: new Date() })
    .where(and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "active"), lt(inventoryReservations.expiresAt, until)));
}

/**
 * Convierte las reservas de un pedido pagado en salida de inventario. Es
 * idempotente. Si las reservas vencieron (pago tardío) intenta apartar de
 * nuevo; si ya no hay existencias devuelve los faltantes para revisión
 * manual: nunca se despacha inventario inexistente.
 */
export async function commitOrderInventory(
  tx: DbOrTx,
  orderId: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; shortages: { componentId: string; requested: number; available: number }[] }> {
  const rows = await tx.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, orderId));
  const pending = rows.filter((r) => r.status !== "committed");
  if (!pending.length) return { ok: true };
  await lockComponents(
    tx,
    pending.map((r) => r.componentId),
  );
  const avail = await componentAvailability(tx, now, orderId);
  const shortages: { componentId: string; requested: number; available: number }[] = [];
  for (const r of pending) {
    const stillReserved = r.status === "active" && r.expiresAt > now;
    if (!stillReserved) {
      const available = Math.max(0, avail.get(r.componentId) ?? 0);
      if (available < r.quantity) shortages.push({ componentId: r.componentId, requested: r.quantity, available });
    }
  }
  if (shortages.length) return { ok: false, shortages };
  for (const r of pending) {
    const inserted = await tx
      .insert(inventoryMovements)
      .values({ componentId: r.componentId, delta: -r.quantity, reason: "venta", orderId, note: "Salida por pago aprobado" })
      .onConflictDoNothing()
      .returning({ id: inventoryMovements.id });
    if (inserted.length) {
      await tx
        .update(inventoryComponents)
        .set({ onHand: sql`${inventoryComponents.onHand} - ${r.quantity}`, updatedAt: now })
        .where(eq(inventoryComponents.id, r.componentId));
    }
    await tx.update(inventoryReservations).set({ status: "committed", updatedAt: now }).where(eq(inventoryReservations.id, r.id));
  }
  return { ok: true };
}

/** Libera reservas activas (pago rechazado, cancelado o vencido). */
export async function releaseOrderReservations(tx: DbOrTx, orderId: string, status: "released" | "expired" = "released") {
  await tx
    .update(inventoryReservations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "active")));
}

/** Marca como vencidas las reservas cuyo plazo terminó. Devuelve los pedidos afectados. */
export async function expireReservations(tx: DbOrTx, now = new Date()): Promise<string[]> {
  const rows = await tx
    .update(inventoryReservations)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(inventoryReservations.status, "active"), lt(inventoryReservations.expiresAt, now)))
    .returning({ orderId: inventoryReservations.orderId });
  return [...new Set(rows.map((r) => r.orderId))];
}

/** Ajuste manual de existencias (auditable). */
export async function adjustStock(tx: DbOrTx, input: { componentId: string; delta: number; reason: "ajuste" | "devolucion" | "correccion"; userId: string; note?: string; orderId?: string }) {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new Error("El ajuste debe ser un entero distinto de cero.");
  await lockComponents(tx, [input.componentId]);
  const [comp] = await tx.select().from(inventoryComponents).where(eq(inventoryComponents.id, input.componentId));
  if (!comp) throw new Error("Componente inexistente.");
  if (comp.onHand + input.delta < 0) throw new Error("El inventario no puede quedar negativo.");
  await tx.insert(inventoryMovements).values({ componentId: input.componentId, delta: input.delta, reason: input.reason, userId: input.userId, note: input.note ?? null, orderId: input.orderId ?? null });
  const [updated] = await tx
    .update(inventoryComponents)
    .set({ onHand: sql`${inventoryComponents.onHand} + ${input.delta}`, updatedAt: new Date() })
    .where(eq(inventoryComponents.id, input.componentId))
    .returning();
  return updated;
}
