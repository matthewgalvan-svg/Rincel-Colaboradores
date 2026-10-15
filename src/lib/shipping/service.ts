import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { inventoryComponents, orders, shipmentEvents, shipments, shippingQuotes } from "@/db/schema";
import type { ShippingStatus } from "@/lib/domain/types";
import { env } from "@/lib/env";
import { getSettings, type StoreSettings } from "@/lib/settings";
import { saveFile } from "@/lib/storage";
import { manualProvider, simulatedProvider } from "./providers";
import { ShippingError, type ParcelSpec, type ShippingProvider } from "./types";

export { ShippingError };

/** Proveedor activo según entorno + configuración. null = no hay método de envío. */
export function resolveShippingProvider(settings: StoreSettings): ShippingProvider | null {
  const e = env();
  if (e.SHIPPING_PROVIDER === "simulated") {
    if (e.APP_ENV === "production") return null;
    return simulatedProvider();
  }
  if (e.SHIPPING_PROVIDER === "manual" && settings.shipping.manual.enabled) return manualProvider(settings.shipping.manual);
  return null;
}

export function isValidPostalCode(cp: string) {
  return /^\d{5}$/.test(cp);
}

/** Calcula peso/medidas con valores reales por componente. null si falta alguno. */
export async function buildParcel(tx: DbOrTx, items: { componentId: string; quantity: number }[], settings: StoreSettings): Promise<ParcelSpec | null> {
  if (!items.length) return null;
  const comps = await tx
    .select()
    .from(inventoryComponents)
    .where(
      inArray(
        inventoryComponents.id,
        items.map((i) => i.componentId),
      ),
    );
  let weight = settings.shipping.packagingWeightGrams;
  if (weight === null) return null;
  let length = 0;
  let width = 0;
  let height = 0;
  for (const item of items) {
    const c = comps.find((x) => x.id === item.componentId);
    if (!c || c.weightGrams === null || c.lengthCm === null || c.widthCm === null || c.heightCm === null) return null;
    weight += c.weightGrams * item.quantity;
    length = Math.max(length, c.lengthCm);
    width = Math.max(width, c.widthCm);
    height += c.heightCm * item.quantity;
  }
  return { weightGrams: weight, lengthCm: length, widthCm: width, heightCm: height };
}

export interface QuoteResult {
  id: string;
  serviceName: string;
  carrier: string | null;
  costCents: number;
  estimatedDays: string | null;
  simulated: boolean;
  expiresAt: string;
  manual: boolean;
}

/** Cotiza y guarda las opciones (servicio, costo, ID y vigencia) antes del pago. */
export async function quoteShipping(
  input: { postalCode: string; state?: string; municipality?: string; cartHash: string; items: { componentId: string; quantity: number }[] },
  tx: DbOrTx = db,
): Promise<QuoteResult[]> {
  if (!isValidPostalCode(input.postalCode)) throw new ShippingError("invalid_postal_code", "Escribe un código postal de 5 dígitos.");
  const settings = await getSettings(tx);
  const provider = resolveShippingProvider(settings);
  if (!provider) throw new ShippingError("no_provider", "Por ahora no tenemos un método de envío disponible para artículos físicos. Escríbenos para ayudarte.");
  const parcel = await buildParcel(tx, input.items, settings);
  if (provider.requiresParcel && !parcel) throw new ShippingError("missing_parcel", "No es posible cotizar: faltan pesos y medidas configurados.");
  if (provider.capabilities.coverage && provider.checkCoverage && !(await provider.checkCoverage(input.postalCode))) {
    throw new ShippingError("no_coverage", "No hay cobertura de envío para ese código postal.");
  }
  let options;
  try {
    options = await provider.quote({ postalCode: input.postalCode, state: input.state, municipality: input.municipality, items: input.items, parcel });
  } catch (err) {
    if (err instanceof ShippingError) throw err;
    throw new ShippingError("provider_error", "No pudimos cotizar el envío en este momento. Intenta de nuevo en unos minutos.");
  }
  if (!options.length) throw new ShippingError("no_coverage", "No hay servicios de envío disponibles para ese código postal.");
  const expiresAt = new Date(Date.now() + settings.shipping.quoteTtlMinutes * 60_000);
  const rows = await tx
    .insert(shippingQuotes)
    .values(
      options.map((o) => ({
        provider: provider.id,
        serviceCode: o.serviceCode,
        serviceName: o.serviceName,
        carrier: o.carrier,
        costCents: o.costCents,
        postalCode: input.postalCode,
        cartHash: input.cartHash,
        providerQuoteId: o.providerQuoteId,
        estimatedDays: o.estimatedDays,
        isSimulated: provider.simulated,
        expiresAt,
      })),
    )
    .returning();
  return rows.map((r) => ({
    id: r.id,
    serviceName: r.serviceName,
    carrier: r.carrier,
    costCents: r.costCents,
    estimatedDays: r.estimatedDays,
    simulated: r.isSimulated,
    expiresAt: r.expiresAt.toISOString(),
    manual: provider.id === "manual",
  }));
}

export type QuoteValidation =
  | { ok: true; quote: typeof shippingQuotes.$inferSelect }
  | { ok: false; reason: "not_found" | "expired" | "mismatch" | "provider_changed" };

/** Revalida la cotización elegida: vigente, mismo carrito, mismo CP y mismo proveedor activo. */
export async function validateQuote(tx: DbOrTx, quoteId: string, cartHash: string, postalCode: string, now = new Date()): Promise<QuoteValidation> {
  const [q] = await tx.select().from(shippingQuotes).where(eq(shippingQuotes.id, quoteId)).limit(1);
  if (!q) return { ok: false, reason: "not_found" };
  if (q.cartHash !== cartHash || q.postalCode !== postalCode) return { ok: false, reason: "mismatch" };
  if (q.expiresAt <= now) return { ok: false, reason: "expired" };
  const provider = resolveShippingProvider(await getSettings(tx));
  if (!provider || provider.id !== q.provider) return { ok: false, reason: "provider_changed" };
  return { ok: true, quote: q };
}

export async function addShipmentEvent(tx: DbOrTx, shipmentId: string, status: ShippingStatus, description: string, source: "proveedor" | "manual" | "sistema", occurredAt = new Date(), providerEventId: string | null = null) {
  await tx.insert(shipmentEvents).values({ shipmentId, status, description, source, occurredAt, providerEventId }).onConflictDoNothing();
}

/**
 * Crea la guía de un envío una sola vez (idempotente). Solo procede si el
 * pedido está pagado, sin revisión pendiente y el envío sigue pendiente. Si
 * falla, conserva el pago, registra el error y deja el envío para reintento.
 */
export async function createLabelForOrder(orderId: string, opts: { actorUserId?: string } = {}): Promise<{ status: "created" | "skipped" | "failed"; message: string }> {
  const settings = await getSettings();
  const provider = resolveShippingProvider(settings);
  if (!provider?.createLabel) return { status: "skipped", message: "El proveedor actual no crea guías automáticamente." };

  // Reclama el envío con bloqueo para que dos procesos no creen dos guías.
  const claim = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) return { ok: false as const, message: "Pedido inexistente." };
    if (order.paymentStatus !== "approved") return { ok: false as const, message: "El pedido no está pagado." };
    if (order.reviewRequired) return { ok: false as const, message: "El pedido requiere revisión antes de enviar." };
    if (!order.requiresShipping || !order.shippingAddress) return { ok: false as const, message: "El pedido no requiere envío." };
    if (order.fulfillmentStatus === "cancelled" || order.fulfillmentStatus === "on_hold") return { ok: false as const, message: "El pedido está detenido o cancelado." };
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.orderId, orderId)).for("update");
    if (!shipment) return { ok: false as const, message: "No existe el envío." };
    if (shipment.trackingNumber || shipment.status !== "pending") return { ok: false as const, message: "La guía ya existe." };
    if (shipment.provider !== provider.id) return { ok: false as const, message: "El proveedor de la cotización ya no está activo." };
    if (shipment.labelLockedUntil && shipment.labelLockedUntil > new Date()) return { ok: false as const, message: "Ya hay una solicitud de guía en curso." };
    await tx
      .update(shipments)
      .set({ labelAttempts: shipment.labelAttempts + 1, labelLockedUntil: new Date(Date.now() + 2 * 60_000) })
      .where(eq(shipments.id, shipment.id));
    return { ok: true as const, order, shipment };
  });
  if (!claim.ok) return { status: "skipped", message: claim.message };

  try {
    const result = await provider.createLabel({
      orderNumber: claim.order.number,
      address: claim.order.shippingAddress!,
      serviceCode: claim.shipment.serviceCode ?? "",
      parcel: null,
      idempotencyKey: claim.shipment.labelIdempotencyKey,
    });
    let labelFileId: string | null = null;
    if (result.labelPdf) {
      const file = await saveFile({ kind: "guia", data: result.labelPdf, filename: `guia-${claim.order.number}.pdf`, mimeType: "application/pdf", orderId, uploadedBy: opts.actorUserId ?? null, isPrivate: true });
      labelFileId = file.id;
    }
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(shipments)
        .set({
          status: "label_created",
          carrier: result.carrier,
          trackingNumber: result.trackingNumber,
          trackingUrl: result.trackingUrl,
          providerShipmentId: result.providerShipmentId,
          labelFileId,
          lastError: null,
          labelLockedUntil: null,
        })
        .where(and(eq(shipments.id, claim.shipment.id), eq(shipments.status, "pending")))
        .returning({ id: shipments.id });
      if (!updated.length) return;
      await tx.update(orders).set({ shippingStatus: "label_created" }).where(eq(orders.id, orderId));
      await addShipmentEvent(tx, claim.shipment.id, "label_created", `Guía creada con ${result.carrier}. Aún no ha sido recolectada.`, "sistema");
    });
    return { status: "created", message: `Guía ${result.trackingNumber} creada.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    await db.update(shipments).set({ lastError: message.slice(0, 500), labelLockedUntil: null }).where(eq(shipments.id, claim.shipment.id));
    return { status: "failed", message };
  }
}
