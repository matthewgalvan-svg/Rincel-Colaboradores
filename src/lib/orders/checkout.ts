import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orderEvents, orderItems, orders } from "@/db/schema";
import { recordEvent } from "@/lib/analytics/server";
import { cartInputSchema, priceCart, snapshotFor, type CartIssue } from "@/lib/cart/pricing";
import { env } from "@/lib/env";
import { componentNeedsFor, OutOfStockError, reserveForOrder } from "@/lib/inventory/service";
import { enqueueNotification, processNotifications } from "@/lib/notifications";
import { getGateway, PaymentsUnavailableError } from "@/lib/payments";
import { PaymentProviderError } from "@/lib/payments/types";
import { generateOrderNumber, hashEmail } from "@/lib/security/tokens";
import { getSettings } from "@/lib/settings";
import { validateQuote } from "@/lib/shipping/service";
import { orderAccessToken, orderPrivateUrl } from "./access";

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);

export const addressSchema = z.object({
  recipient: text(3, 120, "Escribe el nombre de quien recibe."),
  email: z.email("Escribe un correo válido.").max(160),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{10,18}$/, "Escribe un teléfono de 10 dígitos."),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "El código postal debe tener 5 dígitos."),
  state: text(2, 60, "Elige el estado."),
  municipality: text(2, 80, "Escribe el municipio o alcaldía."),
  neighborhood: text(2, 80, "Escribe la colonia."),
  street: text(2, 120, "Escribe la calle."),
  exteriorNumber: text(1, 20, "Escribe el número exterior."),
  interiorNumber: z.string().trim().max(20).optional().default(""),
  references: z.string().trim().max(200).optional().default(""),
});

export const checkoutSchema = z.object({
  checkoutKey: z
    .string()
    .min(16)
    .max(64)
    .regex(/^[\w-]+$/),
  lines: cartInputSchema,
  customer: z.object({
    name: text(3, 120, "Escribe tu nombre completo."),
    email: z.email("Escribe un correo válido.").max(160),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s-]{10,18}$/, "Escribe un teléfono de 10 dígitos."),
  }),
  address: addressSchema.nullable().optional(),
  shippingQuoteId: z.uuid().nullable().optional(),
  expectedTotalCents: z.number().int().min(0),
  acceptTerms: z.literal(true, "Debes aceptar los términos y el aviso de privacidad."),
  analyticsConsent: z.boolean().optional().default(false),
  attribution: z.record(z.string().max(40), z.string().max(120)).optional().default({}),
  sessionId: z.string().max(64).nullable().optional(),
  device: z.enum(["mobile", "tablet", "desktop"]).nullable().optional(),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;

export type CheckoutResult =
  | { ok: true; orderNumber: string; accessToken: string; checkoutUrl: string; reused: boolean }
  | { ok: false; code: "invalid"; fieldErrors: Record<string, string> }
  | { ok: false; code: "cart_issues"; issues: CartIssue[] }
  | { ok: false; code: "address_required" | "quote_required" | "quote_expired" | "quote_mismatch" | "shipping_unavailable"; message: string }
  | { ok: false; code: "total_changed"; message: string; subtotalCents: number; shippingCents: number; totalCents: number }
  | { ok: false; code: "out_of_stock"; message: string }
  | { ok: false; code: "payments_unavailable" | "payment_session_failed"; message: string; orderNumber?: string };

const ALLOWED_ATTRIBUTION = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer_host"];

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? full, lastName: parts.slice(1).join(" ") || parts[0] || full };
}

/**
 * Flujo del lado servidor:
 * validar catálogo/precios → validar cotización → crear pedido pendiente con
 * número único y apartar inventario → crear sesión de pago → devolver enlace.
 * Reintentos con la misma `checkoutKey` reutilizan el pedido (sin duplicar).
 */
export async function createOrderAndCheckout(raw: unknown): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, code: "invalid", fieldErrors };
  }
  const input = parsed.data;
  const e = env();
  const settings = await getSettings();

  // Reintento idempotente del mismo envío del formulario.
  const [existing] = await db.select().from(orders).where(eq(orders.checkoutKey, input.checkoutKey)).limit(1);
  if (existing) {
    if (existing.checkoutUrl && existing.paymentStatus === "pending") {
      return { ok: true, orderNumber: existing.number, accessToken: orderAccessToken(existing.id, existing.accessSalt), checkoutUrl: existing.checkoutUrl, reused: true };
    }
    if (!existing.checkoutUrl && existing.paymentStatus === "pending") return startPaymentSession(existing.id, true);
    return { ok: false, code: "payment_session_failed", message: "Este pedido ya fue procesado. Consulta su estado con tu enlace privado.", orderNumber: existing.number };
  }

  let gatewayEnv: string;
  let gatewayId: string;
  try {
    const g = getGateway();
    gatewayEnv = g.environment;
    gatewayId = g.id;
  } catch (err) {
    if (err instanceof PaymentsUnavailableError) return { ok: false, code: "payments_unavailable", message: "Los pagos en línea no están disponibles en este momento. Escríbenos y te ayudamos a completar tu compra." };
    throw err;
  }

  const priced = await priceCart(db, input.lines, { maxQuantityPerItem: settings.checkout.maxQuantityPerItem });
  if (priced.issues.length || !priced.lines.length) return { ok: false, code: "cart_issues", issues: priced.issues };

  let shippingCents = 0;
  let quoteId: string | null = null;
  let shippingLabel: string | null = null;
  let quoteProvider: string | null = null;
  let quoteService: { code: string; name: string } | null = null;
  if (priced.requiresShipping) {
    if (!input.address) return { ok: false, code: "address_required", message: "Necesitamos la dirección de entrega para los artículos físicos." };
    if (!input.shippingQuoteId) return { ok: false, code: "quote_required", message: "Cotiza y elige un envío antes de pagar." };
    const v = await validateQuote(db, input.shippingQuoteId, priced.shippingCartHash, input.address.postalCode);
    if (!v.ok) {
      if (v.reason === "expired") return { ok: false, code: "quote_expired", message: "La cotización de envío venció. Vuelve a cotizar para ver el costo actualizado antes de pagar." };
      if (v.reason === "provider_changed") return { ok: false, code: "shipping_unavailable", message: "El método de envío cambió. Vuelve a cotizar." };
      return { ok: false, code: "quote_mismatch", message: "Tu carrito o código postal cambió desde la cotización. Vuelve a cotizar el envío." };
    }
    shippingCents = v.quote.costCents;
    quoteId = v.quote.id;
    shippingLabel = v.quote.serviceName;
    quoteProvider = v.quote.provider;
    quoteService = { code: v.quote.serviceCode, name: v.quote.serviceName };
  }

  const totalCents = priced.subtotalCents + shippingCents;
  if (totalCents !== input.expectedTotalCents) {
    return {
      ok: false,
      code: "total_changed",
      message: "El total cambió desde que lo revisaste. Confirma el nuevo total antes de pagar.",
      subtotalCents: priced.subtotalCents,
      shippingCents,
      totalCents,
    };
  }

  const now = new Date();
  const reservationExpiresAt = new Date(now.getTime() + settings.checkout.reservationMinutes * 60_000);
  const attribution = Object.fromEntries(Object.entries(input.attribution).filter(([k]) => ALLOWED_ATTRIBUTION.includes(k)));
  const isTest = gatewayEnv !== "production" || e.APP_ENV !== "production";

  let orderId: string;
  try {
    orderId = await db.transaction(async (tx) => {
      let number = generateOrderNumber(now);
      for (let i = 0; i < 5; i++) {
        const [clash] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.number, number)).limit(1);
        if (!clash) break;
        number = generateOrderNumber(now);
      }
      const [order] = await tx
        .insert(orders)
        .values({
          number,
          accessSalt: randomBytes(16).toString("base64url"),
          checkoutKey: input.checkoutKey,
          customerName: input.customer.name,
          email: input.customer.email.toLowerCase(),
          emailHash: hashEmail(input.customer.email),
          phone: input.customer.phone,
          shippingAddress: priced.requiresShipping && input.address ? { ...input.address, email: input.address.email.toLowerCase() } : null,
          requiresShipping: priced.requiresShipping,
          hasDigital: priced.hasDigital,
          subtotalCents: priced.subtotalCents,
          discountCents: 0,
          shippingCents,
          totalCents,
          paymentStatus: "pending",
          fulfillmentStatus: "awaiting_payment",
          shippingStatus: priced.requiresShipping ? "awaiting_payment" : "not_required",
          activationStatus: priced.lines.some((l) => ["portabilidad", "linea_nueva", "datos"].includes(l.product.category)) ? "awaiting_payment" : "not_required",
          paymentProvider: gatewayId,
          paymentEnvironment: gatewayEnv,
          isTest,
          shippingQuoteId: quoteId,
          shippingMethodLabel: shippingLabel,
          reservationExpiresAt,
          termsAcceptedAt: now,
          analyticsConsent: input.analyticsConsent,
          analyticsSessionId: input.sessionId ?? null,
          attribution: { ...attribution, ...(quoteProvider ? { shipping_provider: quoteProvider, shipping_service: quoteService?.code ?? "" } : {}) },
          deviceType: input.device ?? null,
        })
        .returning();
      await tx.insert(orderItems).values(
        priced.lines.map((l) => ({
          orderId: order.id,
          productId: l.product.id,
          variantId: l.variant.id,
          productName: l.product.name,
          variantLabel: l.variant.label,
          category: l.product.category,
          delivery: l.delivery,
          simType: l.variant.simType,
          unitPriceCents: l.unitPriceCents,
          quantity: l.quantity,
          lineTotalCents: l.lineTotalCents,
          linesPerUnit: l.product.linesPerUnit,
          snapshot: snapshotFor(l, now),
        })),
      );
      const needs = await componentNeedsFor(
        tx,
        priced.lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity })),
      );
      await reserveForOrder(tx, order.id, needs, reservationExpiresAt, now);
      await tx.insert(orderEvents).values({ orderId: order.id, type: "creado", message: "Pedido creado. Pendiente de pago.", visibleToCustomer: true });
      await enqueueNotification(tx, {
        orderId: order.id,
        template: "pedido_creado",
        recipient: order.email,
        payload: { orderNumber: order.number, customerName: order.customerName, totalCents, sellerName: settings.sellerName, orderUrl: orderPrivateUrl(e.APP_URL, order) },
        dedupKey: `order:${order.id}:created`,
      });
      return order.id;
    });
  } catch (err) {
    if (err instanceof OutOfStockError) return { ok: false, code: "out_of_stock", message: "Alguno de tus productos se agotó mientras comprabas. Revisa tu carrito." };
    throw err;
  }

  void processNotifications({ orderId }).catch(() => undefined);
  return startPaymentSession(orderId, false);
}

/** Crea (o reintenta) la sesión de pago para un pedido pendiente. */
export async function startPaymentSession(orderId: string, reused: boolean): Promise<CheckoutResult> {
  const e = env();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Pedido inexistente.");
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const settings = await getSettings();
  const token = orderAccessToken(order.id, order.accessSalt);
  const base = `${e.APP_URL}/checkout/resultado?pedido=${encodeURIComponent(order.number)}&t=${token}`;
  try {
    const gateway = getGateway();
    const { firstName, lastName } = splitName(order.customerName);
    const session = await gateway.createCheckout({
      orderNumber: order.number,
      totalCents: order.totalCents,
      items: [
        ...items.map((i) => ({ title: `${i.productName} (${i.variantLabel})`, unitPriceCents: i.unitPriceCents, quantity: i.quantity, externalCode: i.variantId })),
        ...(order.shippingCents > 0 ? [{ title: `Envío: ${order.shippingMethodLabel ?? "estándar"}`, unitPriceCents: order.shippingCents, quantity: 1, externalCode: "envio" }] : []),
      ],
      payer: { email: order.email, firstName, lastName },
      returnUrls: { success: `${base}&r=aprobado`, failure: `${base}&r=rechazado`, pending: `${base}&r=pendiente` },
      expiresInMinutes: settings.checkout.reservationMinutes,
      offlineDueHours: settings.checkout.pendingPaymentMaxHours,
      idempotencyKey: `checkout-${order.id}`,
    });
    await db.transaction(async (tx) => {
      await tx.update(orders).set({ providerOrderId: session.providerOrderId, checkoutUrl: session.checkoutUrl }).where(eq(orders.id, order.id));
      await tx.insert(orderEvents).values({ orderId: order.id, type: "sesion_pago", message: "Enlace de pago creado.", data: { provider: gateway.id } });
    });
    await recordEvent({ name: "payment_started", orderId: order.id, sessionId: order.analyticsSessionId, valueCents: order.totalCents, device: order.deviceType, isTest: order.isTest });
    return { ok: true, orderNumber: order.number, accessToken: token, checkoutUrl: session.checkoutUrl, reused };
  } catch (err) {
    const message = err instanceof PaymentProviderError || err instanceof PaymentsUnavailableError ? err.message : "Error inesperado";
    await db.insert(orderEvents).values({ orderId: order.id, type: "error_pago", message: `No se pudo crear el enlace de pago: ${message}` });
    await recordEvent({ name: "checkout_error", orderId: order.id, sessionId: order.analyticsSessionId, isTest: order.isTest, meta: { stage: "payment_session" } });
    return {
      ok: false,
      code: "payment_session_failed",
      message: "No pudimos abrir el pago en este momento. Tus datos se conservaron: intenta de nuevo en unos segundos.",
      orderNumber: order.number,
    };
  }
}
