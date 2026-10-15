import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { activations, analyticsEvents, inventoryComponents, orders, receipts, refunds, shipmentEvents, shipments, shippingQuotes } from "@/db/schema";
import { addInternalNote, executeRefund, OpError, recordShipmentUpdate, registerManualLabel, requestRefund, resolveReview, setFulfillmentStatus } from "@/lib/admin/order-ops";
import { recordEvent } from "@/lib/analytics/server";
import { CLIENT_EVENTS } from "@/lib/analytics/events";
import { can } from "@/lib/auth/guard";
import { priceCart } from "@/lib/cart/pricing";
import { findOrderByToken, orderAccessToken } from "@/lib/orders/access";
import { createOrderAndCheckout } from "@/lib/orders/checkout";
import { renderReceiptPdf, type ReceiptData } from "@/lib/orders/receipt";
import { setGatewayOverride } from "@/lib/payments";
import { syncProviderOrder } from "@/lib/payments/sync";
import { createLabelForOrder, quoteShipping, ShippingError } from "@/lib/shipping/service";
import { ADDRESS, checkout, orderByNumber } from "../helpers/checkout";
import { createFakeMercadoPago } from "../helpers/fake-mp";
import { resetDatabase } from "../helpers/db";

const ADMIN = { id: "admin-1", email: "admin@test", role: "admin" as const };
const STAFF = { id: "staff-1", email: "staff@test", role: "staff" as const };

async function stock(id: string) {
  const [c] = await db.select().from(inventoryComponents).where(eq(inventoryComponents.id, id));
  return c.onHand;
}

/** Aprueba un pedido en la pasarela simulada y sincroniza. */
async function approveSimulated(orderNumber: string) {
  const o = await orderByNumber(orderNumber);
  const { simulatedProviderOrders } = await import("@/db/schema");
  await db.update(simulatedProviderOrders).set({ status: "processed", statusDetail: "accredited", paymentType: "credit_card", paymentMethodId: "visa" }).where(eq(simulatedProviderOrders.id, o.providerOrderId!));
  await syncProviderOrder({ orderId: o.id, source: "manual" });
  return orderByNumber(orderNumber);
}

describe("Inventario y paquetes", () => {
  beforeEach(async () => {
    await resetDatabase(1);
  });

  it("stock concurrente: con una sola unidad, de dos compras simultáneas solo una aparta", async () => {
    const line = { productId: "rino-230-linea-nueva", variantCode: "fisico", quantity: 1 };
    const [a, b] = await Promise.all([checkout([line]), checkout([line])]);
    const oks = [a.result, b.result].filter((r) => r.ok);
    const fails = [a.result, b.result].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toHaveLength(1);
    expect(!fails[0].ok && fails[0].code).toMatch(/out_of_stock|cart_issues/);
  });

  it("2×1 físico consume 2 chips; el kit consume 12 (no cuenta como uno)", async () => {
    await db.update(inventoryComponents).set({ onHand: 13 }).where(eq(inventoryComponents.id, "sim-rincel"));
    const priced2x1 = await priceCart(db, [{ productId: "rino-230-portabilidad-2x1", variantCode: "fisico", quantity: 1 }], { maxQuantityPerItem: 10 });
    expect(priced2x1.physicalComponents).toEqual([{ componentId: "sim-rincel", quantity: 2 }]);
    const pricedKit = await priceCart(db, [{ productId: "kit-colaborador", variantCode: "unico", quantity: 1 }], { maxQuantityPerItem: 10 });
    expect(pricedKit.physicalComponents).toEqual(expect.arrayContaining([{ componentId: "sim-rincel", quantity: 12 }, { componentId: "volantes-kit", quantity: 1 }]));
    // 13 chips alcanzan para un kit (12) pero no para kit + 2×1 (14).
    const both = await priceCart(db, [{ productId: "kit-colaborador", variantCode: "unico", quantity: 1 }, { productId: "rino-230-portabilidad-2x1", variantCode: "fisico", quantity: 1 }], { maxQuantityPerItem: 10 });
    expect(both.issues).toHaveLength(0); // la disponibilidad por variante pasa…
    await db.update(inventoryComponents).set({ onHand: 1 }).where(eq(inventoryComponents.id, "volantes-kit"));
    const { result } = await checkout([{ productId: "kit-colaborador", variantCode: "unico", quantity: 1 }, { productId: "rino-230-portabilidad-2x1", variantCode: "fisico", quantity: 1 }]);
    expect(result.ok).toBe(false); // …pero la reserva transaccional detecta el faltante combinado.
    expect(!result.ok && result.code).toBe("out_of_stock");
  });

  it("2×1 eSIM: digital, sin envío ni cotización; al pagar genera 2 activaciones eSIM", async () => {
    await db.update(inventoryComponents).set({ onHand: 0 });
    const { result, priced } = await checkout([{ productId: "rino-230-portabilidad-2x1", variantCode: "esim", quantity: 1 }]);
    expect(priced.requiresShipping).toBe(false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const o = await approveSimulated(result.orderNumber);
    expect(o.totalCents).toBe(23000);
    expect(o.shippingCents).toBe(0);
    expect(o.shippingStatus).toBe("not_required");
    expect(o.shippingAddress).toBeNull();
    const acts = await db.select().from(activations).where(eq(activations.orderId, o.id));
    expect(acts).toHaveLength(2);
    expect(acts.every((a) => a.simType === "esim" && a.kind === "portabilidad")).toBe(true);
    expect((await db.select().from(shipments).where(eq(shipments.orderId, o.id))).length).toBe(0);
  });

  it("eSIM solo existe en el 2×1", async () => {
    const r = await priceCart(db, [{ productId: "rino-230-portabilidad", variantCode: "esim", quantity: 1 }], { maxQuantityPerItem: 10 });
    expect(r.issues[0]?.code).toBe("variant_unavailable");
  });
});

describe("Envíos y cotizaciones", () => {
  beforeEach(async () => {
    await resetDatabase(20);
  });

  it("carrito mixto (eSIM + chip de datos) exige dirección y cotización previa", async () => {
    const lines = [
      { productId: "rino-230-portabilidad-2x1", variantCode: "esim", quantity: 1 },
      { productId: "chip-datos-10gb-7dias", variantCode: "fisico", quantity: 1 },
    ];
    const priced = await priceCart(db, lines, { maxQuantityPerItem: 10 });
    expect(priced.requiresShipping && priced.hasDigital).toBe(true);
    const noQuote = await createOrderAndCheckout({
      checkoutKey: "mixto-sin-cotizacion-0001",
      lines,
      customer: { name: "Persona Prueba", email: "p@example.com", phone: "8112345678" },
      address: ADDRESS,
      expectedTotalCents: priced.subtotalCents,
      acceptTerms: true,
    });
    expect(!noQuote.ok && noQuote.code).toBe("quote_required");
    const { result, shipping } = await checkout(lines);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const o = await orderByNumber(result.orderNumber);
    expect(o.shippingCents).toBe(shipping);
    expect(o.totalCents).toBe(23000 + 14000 + shipping);
    expect(o.requiresShipping && o.hasDigital).toBe(true);
  });

  it("cotización vencida o de otro carrito se rechaza antes de cobrar", async () => {
    const lines = [{ productId: "chip-datos-10gb-7dias", variantCode: "fisico", quantity: 1 }];
    const priced = await priceCart(db, lines, { maxQuantityPerItem: 10 });
    const [q] = await quoteShipping({ postalCode: "64000", cartHash: priced.shippingCartHash, items: priced.physicalComponents });
    await db.update(shippingQuotes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(shippingQuotes.id, q.id));
    const base = { lines, customer: { name: "Persona Prueba", email: "p@example.com", phone: "8112345678" }, address: ADDRESS, shippingQuoteId: q.id, expectedTotalCents: priced.subtotalCents + q.costCents, acceptTerms: true as const };
    const expired = await createOrderAndCheckout({ ...base, checkoutKey: "cotizacion-vencida-000001" });
    expect(!expired.ok && expired.code).toBe("quote_expired");
    const [q2] = await quoteShipping({ postalCode: "64000", cartHash: priced.shippingCartHash, items: priced.physicalComponents });
    const otherCp = await createOrderAndCheckout({ ...base, checkoutKey: "cotizacion-otro-cp-000001", shippingQuoteId: q2.id, address: { ...ADDRESS, postalCode: "01000" } });
    expect(!otherCp.ok && otherCp.code).toBe("quote_mismatch");
    const otherCart = await createOrderAndCheckout({ ...base, checkoutKey: "cotizacion-otro-carro-0001", shippingQuoteId: q2.id, lines: [{ ...lines[0], quantity: 3 }] });
    expect(!otherCart.ok && otherCart.code).toMatch(/quote_mismatch|total_changed/);
  });

  it("errores de cotización: CP inválido, sin cobertura y falla del proveedor", async () => {
    const items = [{ componentId: "sim-datos", quantity: 1 }];
    await expect(quoteShipping({ postalCode: "6400", cartHash: "x", items })).rejects.toMatchObject({ code: "invalid_postal_code" });
    await expect(quoteShipping({ postalCode: "99000", cartHash: "x", items })).rejects.toMatchObject({ code: "no_coverage" });
    await expect(quoteShipping({ postalCode: "00000", cartHash: "x", items })).rejects.toBeInstanceOf(ShippingError);
  });

  it("guía: una sola por envío aunque se pida dos veces a la vez; 'guía creada' no es 'recolectado'", async () => {
    const { result } = await checkout([{ productId: "mifi-rincel", variantCode: "unico", quantity: 1 }]);
    if (!result.ok) throw new Error("checkout");
    const o = await approveSimulated(result.orderNumber);
    const [a, b] = await Promise.all([createLabelForOrder(o.id), createLabelForOrder(o.id)]);
    expect([a.status, b.status].filter((s) => s === "created")).toHaveLength(1);
    const [s] = await db.select().from(shipments).where(eq(shipments.orderId, o.id));
    expect(s.status).toBe("label_created");
    expect(s.trackingNumber).toMatch(/^SIM/);
    expect(s.labelFileId).toBeTruthy();
    const again = await createLabelForOrder(o.id);
    expect(again.status).toBe("skipped");
    await expect(registerManualLabel(o.id, { carrier: "X", trackingNumber: "123456" }, STAFF)).rejects.toThrow(/una guía/i);
    expect((await orderByNumber(result.orderNumber)).shippingStatus).toBe("label_created");
  });

  it("guía fallida: conserva el pago, registra el error y permite reintentar sin cobrar de nuevo", async () => {
    const { result } = await checkout([{ productId: "mifi-rincel", variantCode: "unico", quantity: 1 }], { postalCode: "00001" });
    if (!result.ok) throw new Error("checkout");
    const o = await approveSimulated(result.orderNumber);
    const r = await createLabelForOrder(o.id);
    expect(r.status).toBe("failed");
    const [s] = await db.select().from(shipments).where(eq(shipments.orderId, o.id));
    expect(s.lastError).toMatch(/simulado/);
    expect(s.trackingNumber).toBeNull();
    const after = await orderByNumber(result.orderNumber);
    expect(after.paymentStatus).toBe("approved");
    // Reintento: el pago no se toca; registrar guía manual funciona.
    await registerManualLabel(o.id, { carrier: "Paquetería X", trackingNumber: "ABC123456" }, STAFF);
    await recordShipmentUpdate(o.id, { status: "picked_up", description: "Recolectado" }, STAFF);
    const events = await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, s.id));
    expect(events.map((e) => e.status)).toEqual(expect.arrayContaining(["label_created", "picked_up"]));
  });

  it("no se prepara ni envía un pedido sin pago o con anomalía", async () => {
    const { result } = await checkout([{ productId: "mifi-rincel", variantCode: "unico", quantity: 1 }]);
    if (!result.ok) throw new Error("checkout");
    const pending = await orderByNumber(result.orderNumber);
    await expect(setFulfillmentStatus(pending.id, "preparing", STAFF)).rejects.toBeInstanceOf(OpError);
    const o = await approveSimulated(result.orderNumber);
    await db.update(orders).set({ reviewRequired: true, reviewReason: "prueba" }).where(eq(orders.id, o.id));
    await expect(registerManualLabel(o.id, { carrier: "X", trackingNumber: "123456" }, STAFF)).rejects.toThrow(/anomalía/);
    expect((await createLabelForOrder(o.id)).status).toBe("skipped");
    await expect(resolveReview(o.id, "verificado", STAFF)).rejects.toThrow(/administrador/);
    await resolveReview(o.id, "verificado con el cliente", ADMIN);
    await setFulfillmentStatus(o.id, "preparing", STAFF);
    expect((await orderByNumber(result.orderNumber)).fulfillmentStatus).toBe("preparing");
  });
});

describe("Acceso, comprobantes y analítica", () => {
  beforeEach(async () => {
    await resetDatabase(20);
  });

  it("el número de pedido solo no revela datos; se requiere el token correcto", async () => {
    const a = await checkout([{ productId: "chip-datos-10gb-30dias", variantCode: "fisico", quantity: 1 }]);
    const b = await checkout([{ productId: "chip-datos-20gb-30dias", variantCode: "fisico", quantity: 1 }]);
    if (!a.result.ok || !b.result.ok) throw new Error("checkout");
    expect(await findOrderByToken(a.result.orderNumber, null)).toBeNull();
    expect(await findOrderByToken(a.result.orderNumber, "x".repeat(43))).toBeNull();
    expect(await findOrderByToken(a.result.orderNumber, b.result.accessToken)).toBeNull();
    const ok = await findOrderByToken(a.result.orderNumber, a.result.accessToken);
    expect(ok?.number).toBe(a.result.orderNumber);
    expect(orderAccessToken(ok!.id, ok!.accessSalt)).toBe(a.result.accessToken);
  });

  it("permisos: el personal no ejecuta reembolsos, ni cambia precios, inventario o usuarios", () => {
    expect(can(STAFF, "orders.update")).toBe(true);
    expect(can(STAFF, "refunds.request")).toBe(true);
    expect(can(STAFF, "refunds.execute")).toBe(false);
    expect(can(STAFF, "products.manage")).toBe(false);
    expect(can(STAFF, "inventory.manage")).toBe(false);
    expect(can(STAFF, "users.manage")).toBe(false);
    expect(can(STAFF, "orders.export")).toBe(false);
    expect(can(null, "orders.read")).toBe(false);
    expect(can(ADMIN, "refunds.execute")).toBe(true);
  });

  it("comprobante: datos del pedido, total MXN y PDF válido sin presentarse como CFDI", async () => {
    const { result, shipping } = await checkout([{ productId: "rino-300-portabilidad", variantCode: "fisico", quantity: 2 }]);
    if (!result.ok) throw new Error("checkout");
    const o = await approveSimulated(result.orderNumber);
    const [r] = await db.select().from(receipts).where(eq(receipts.orderId, o.id));
    const data = r.data as unknown as ReceiptData;
    expect(data.orderNumber).toBe(o.number);
    expect(data.sellerName).toBe("Rincel Colaboradores");
    expect(data.items[0]).toMatchObject({ name: "Rino 300 — Portabilidad", quantity: 2, unitPriceCents: 30000, lineTotalCents: 60000 });
    expect(data.subtotalCents).toBe(60000);
    expect(data.shippingCents).toBe(shipping);
    expect(data.totalCents).toBe(60000 + shipping);
    expect(data.currency).toBe("MXN");
    expect(data.isTest).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/8112345678|Juárez|tarjeta \d{4}/);
    const pdf = Buffer.from(await renderReceiptPdf(data));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("analítica: 'purchase' es único por pedido y no se acepta desde el navegador", async () => {
    expect((CLIENT_EVENTS as readonly string[]).includes("purchase")).toBe(false);
    const { result } = await checkout([{ productId: "chip-datos-10gb-7dias", variantCode: "fisico", quantity: 1 }]);
    if (!result.ok) throw new Error("checkout");
    const o = await approveSimulated(result.orderNumber);
    await syncProviderOrder({ orderId: o.id, source: "manual" });
    const inserted = await recordEvent({ name: "purchase", orderId: o.id, valueCents: o.totalCents });
    expect(inserted).toBe(false);
    const rows = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.name, "purchase"), eq(analyticsEvents.orderId, o.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].meta).toBeNull();
  });
});

describe("Reembolsos reales vía proveedor", () => {
  beforeEach(async () => {
    await resetDatabase(10);
  });

  it("solicitud del personal + ejecución del administrador con devolución de existencias", async () => {
    const mp = createFakeMercadoPago();
    setGatewayOverride(mp.gateway());
    const { result } = await checkout([{ productId: "mifi-rincel", variantCode: "unico", quantity: 1 }]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited" });
    await syncProviderOrder({ orderId: order.id, source: "manual" });
    expect(await stock("mifi-satco-f02")).toBe(9);
    const r = await requestRefund(order.id, { amountCents: order.totalCents, reason: "Cliente desistió" }, STAFF);
    await expect(executeRefund(r.id, { restock: true }, STAFF)).rejects.toThrow(/administrador/);
    await expect(requestRefund(order.id, { amountCents: order.totalCents, reason: "doble" }, STAFF)).rejects.toThrow(/excede/);
    const status = await executeRefund(r.id, { restock: true }, ADMIN);
    expect(status).toBe("approved");
    expect(mp.calls.some((c) => c.path.endsWith("/refund") && c.idempotencyKey === r.idempotencyKey)).toBe(true);
    const after = await orderByNumber(result.orderNumber);
    expect(after.paymentStatus).toBe("refunded");
    expect(await stock("mifi-satco-f02")).toBe(10);
    const [row] = await db.select().from(refunds).where(eq(refunds.id, r.id));
    expect(row.status).toBe("approved");
    await addInternalNote(order.id, "Reembolso confirmado", ADMIN);
  });
});
