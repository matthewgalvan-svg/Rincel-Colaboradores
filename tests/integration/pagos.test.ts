import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { activations, analyticsEvents, inventoryComponents, inventoryReservations, orders, receipts, shipments, webhookEvents } from "@/db/schema";
import { runJobs } from "@/lib/jobs";
import { setGatewayOverride } from "@/lib/payments";
import { syncProviderOrder } from "@/lib/payments/sync";
import { handlePaymentWebhook } from "@/lib/payments/webhook";
import { createFakeMercadoPago, signedNotification } from "../helpers/fake-mp";
import { checkout, orderByNumber } from "../helpers/checkout";
import { resetDatabase } from "../helpers/db";

const RINO150 = { productId: "rino-150-portabilidad", variantCode: "fisico", quantity: 1 };

async function stock(id: string) {
  const [c] = await db.select().from(inventoryComponents).where(eq(inventoryComponents.id, id));
  return c.onHand;
}

async function purchases(orderId: string) {
  const r = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.name, "purchase"), eq(analyticsEvents.orderId, orderId)));
  return r.length;
}

describe("Pagos con Mercado Pago (Orders) — doble de prueba", () => {
  let mp: ReturnType<typeof createFakeMercadoPago>;
  beforeEach(async () => {
    await resetDatabase(10);
    mp = createFakeMercadoPago();
    setGatewayOverride(mp.gateway());
  });

  it("crea la orden online con idempotencia y total que cuadra con los artículos", async () => {
    const { result } = await checkout([RINO150]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checkoutUrl).toMatch(/^https:\/\/www\.mercadopago\.com\.mx\//);
    const post = mp.calls.find((c) => c.method === "POST");
    expect(post?.idempotencyKey).toMatch(/^checkout-/);
    const order = await orderByNumber(result.orderNumber);
    expect(order.paymentStatus).toBe("pending");
    expect(order.providerOrderId).toMatch(/^ORD01TEST/);
    // Inventario apartado, no descontado.
    expect(await stock("sim-rincel")).toBe(10);
    const res = await db.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, order.id));
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("active");
  });

  it("pago aprobado: confirma solo tras consultar al proveedor; comprobante, inventario y compra únicos ante webhooks duplicados", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited" });

    const n1 = signedNotification(order.providerOrderId!, "req-1");
    const r1 = await handlePaymentWebhook(n1);
    expect(r1.status).toBe(200);
    let o = await orderByNumber(result.orderNumber);
    expect(o.paymentStatus).toBe("approved");
    expect(o.fulfillmentStatus).toBe("pending");
    expect(o.shippingStatus).toBe("pending");
    expect(o.activationStatus).toBe("pending");
    expect(await stock("sim-rincel")).toBe(9);
    expect(await purchases(o.id)).toBe(1);
    expect((await db.select().from(receipts).where(eq(receipts.orderId, o.id))).length).toBe(1);
    expect((await db.select().from(shipments).where(eq(shipments.orderId, o.id))).length).toBe(1);
    expect((await db.select().from(activations).where(eq(activations.orderId, o.id))).length).toBe(1);

    // Mismo x-request-id: duplicado → sin efectos.
    const r2 = await handlePaymentWebhook(n1);
    expect(r2.body).toMatchObject({ duplicate: true });
    // Reintento del proveedor con otro request-id: tampoco duplica.
    const r3 = await handlePaymentWebhook(signedNotification(order.providerOrderId!, "req-2"));
    expect(r3.status).toBe(200);
    o = await orderByNumber(result.orderNumber);
    expect(o.paymentStatus).toBe("approved");
    expect(await stock("sim-rincel")).toBe(9);
    expect(await purchases(o.id)).toBe(1);
    expect((await db.select().from(receipts).where(eq(receipts.orderId, o.id))).length).toBe(1);
  });

  it("firma inválida: 401 y el pedido no cambia", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited" });
    const forged = signedNotification(order.providerOrderId!, "req-x", { secret: "otro-secreto" });
    const r = await handlePaymentWebhook(forged);
    expect(r.status).toBe(401);
    expect((await orderByNumber(result.orderNumber)).paymentStatus).toBe("pending");
    const rows = await db.select().from(webhookEvents).where(eq(webhookEvents.signatureValid, false));
    expect(rows.length).toBe(1);
    // Encabezado ausente.
    const r2 = await handlePaymentWebhook({ headers: new Headers(), query: new URLSearchParams({ "data.id": order.providerOrderId! }), body: {} });
    expect(r2.status).toBe(401);
  });

  it("pago rechazado conserva la reserva para reintentar; un aprobado posterior confirma", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "failed", detail: "cc_rejected_insufficient_amount" });
    await handlePaymentWebhook(signedNotification(order.providerOrderId!, "r-1"));
    let o = await orderByNumber(result.orderNumber);
    expect(o.paymentStatus).toBe("rejected");
    expect(await purchases(o.id)).toBe(0);
    const res = await db.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, o.id));
    expect(res[0].status).toBe("active");
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited" });
    await handlePaymentWebhook(signedNotification(order.providerOrderId!, "r-2"));
    o = await orderByNumber(result.orderNumber);
    expect(o.paymentStatus).toBe("approved");
  });

  it("efectivo/SPEI pendiente: queda en proceso hasta acreditarse y extiende el apartado", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    const expires = new Date(Date.now() + 48 * 3600_000).toISOString();
    mp.pay(order.providerOrderId!, { status: "action_required", detail: "waiting_payment", type: "ticket", method: "oxxo", expiresAt: expires });
    await handlePaymentWebhook(signedNotification(order.providerOrderId!, "p-1"));
    const o = await orderByNumber(result.orderNumber);
    expect(o.paymentStatus).toBe("in_process");
    expect(o.fulfillmentStatus).toBe("awaiting_payment");
    expect(await purchases(o.id)).toBe(0);
    expect(o.reservationExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 47 * 3600_000);
    const [res] = await db.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, o.id));
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3600_000);
  });

  it("importe distinto: no se aprueba y queda en revisión", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited", amount: "1.00" });
    await handlePaymentWebhook(signedNotification(order.providerOrderId!, "a-1"));
    const o = await orderByNumber(result.orderNumber);
    expect(o.paymentStatus).toBe("pending");
    expect(o.reviewRequired).toBe(true);
    expect(o.reviewReason).toMatch(/Importe/);
    expect(await purchases(o.id)).toBe(0);
    expect(await stock("sim-rincel")).toBe(10);
  });

  it("cuenta receptora distinta: no se aprueba", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited", userId: "999" });
    await handlePaymentWebhook(signedNotification(order.providerOrderId!, "u-1"));
    const o = await orderByNumber(result.orderNumber);
    expect(o.paymentStatus).toBe("pending");
    expect(o.reviewReason).toMatch(/receptora/);
  });

  it("moneda distinta: no se aprueba", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited", currency: "USD" });
    await handlePaymentWebhook(signedNotification(order.providerOrderId!, "c-1"));
    expect((await orderByNumber(result.orderNumber)).paymentStatus).toBe("pending");
  });

  it("notificaciones fuera de orden: un estado anterior no revierte un pago aprobado", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited" });
    await handlePaymentWebhook(signedNotification(order.providerOrderId!, "o-1"));
    mp.pay(order.providerOrderId!, { status: "action_required", detail: "waiting_payment" });
    await handlePaymentWebhook(signedNotification(order.providerOrderId!, "o-2"));
    expect((await orderByNumber(result.orderNumber)).paymentStatus).toBe("approved");
  });

  it("notificación de otro entorno (producción en sandbox) se ignora", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited" });
    const r = await handlePaymentWebhook(signedNotification(order.providerOrderId!, "e-1", { liveMode: true }));
    expect(r.body).toMatchObject({ ignored: true });
    expect((await orderByNumber(result.orderNumber)).paymentStatus).toBe("pending");
  });

  it("la conciliación recupera un pago cuyo webhook se perdió", async () => {
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited" });
    await db.update(orders).set({ updatedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(orders.id, order.id));
    const report = await runJobs();
    expect(report.reconciled).toBeGreaterThanOrEqual(1);
    expect((await orderByNumber(result.orderNumber)).paymentStatus).toBe("approved");
  });

  it("pago tardío tras vencer el apartado y sin existencias: se registra el pago pero queda en revisión y no se despacha", async () => {
    await db.update(inventoryComponents).set({ onHand: 1 }).where(eq(inventoryComponents.id, "sim-rincel"));
    const { result } = await checkout([RINO150]);
    if (!result.ok) throw new Error("checkout");
    const order = await orderByNumber(result.orderNumber);
    // Vence el apartado y otra persona compra la última unidad.
    await db.update(inventoryReservations).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(inventoryReservations.orderId, order.id));
    await db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 60_000) }).where(eq(orders.id, order.id));
    await runJobs();
    expect((await orderByNumber(result.orderNumber)).paymentStatus).toBe("expired");
    const second = await checkout([RINO150]);
    expect(second.result.ok).toBe(true);
    if (!second.result.ok) return;
    const o2 = await orderByNumber(second.result.orderNumber);
    mp.pay(o2.providerOrderId!, { status: "processed", detail: "accredited" });
    await syncProviderOrder({ orderId: o2.id, source: "manual" });
    // Llega tarde la aprobación del primero.
    mp.pay(order.providerOrderId!, { status: "processed", detail: "accredited" });
    await syncProviderOrder({ orderId: order.id, source: "manual" });
    const late = await orderByNumber(result.orderNumber);
    expect(late.paymentStatus).toBe("approved");
    expect(late.reviewRequired).toBe(true);
    expect(late.fulfillmentStatus).toBe("on_hold");
    expect(await stock("sim-rincel")).toBe(0);
  });
});

describe("Totales del servidor", () => {
  beforeEach(async () => {
    await resetDatabase(10);
  });

  it("ignora precios manipulados y exige confirmar el total real", async () => {
    const manipulated = await checkout([{ ...RINO150, ...({ priceCents: 1 } as object) }], { expectedTotalCents: 100 });
    expect(manipulated.result.ok).toBe(false);
    if (manipulated.result.ok) return;
    expect(manipulated.result.code).toBe("total_changed");
    if (manipulated.result.code !== "total_changed") return;
    expect(manipulated.result.subtotalCents).toBe(15000);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orders);
    expect(n).toBe(0);
  });

  it("el mismo envío del formulario (checkoutKey) no duplica pedidos", async () => {
    const key = "llave-de-prueba-0123456789";
    const a = await checkout([RINO150], { checkoutKey: key });
    const b = await checkout([RINO150], { checkoutKey: key });
    expect(a.result.ok && b.result.ok).toBe(true);
    if (!a.result.ok || !b.result.ok) return;
    expect(b.result.orderNumber).toBe(a.result.orderNumber);
    expect(b.result.reused).toBe(true);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orders);
    expect(n).toBe(1);
  });
});
