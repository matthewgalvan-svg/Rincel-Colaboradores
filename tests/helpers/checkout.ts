import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { priceCart } from "@/lib/cart/pricing";
import { createOrderAndCheckout, type CheckoutResult } from "@/lib/orders/checkout";
import { quoteShipping } from "@/lib/shipping/service";

export const ADDRESS = {
  recipient: "Persona Prueba",
  email: "persona@example.com",
  phone: "8112345678",
  postalCode: "64000",
  state: "Nuevo León",
  municipality: "Monterrey",
  neighborhood: "Centro",
  street: "Av. Juárez",
  exteriorNumber: "100",
  interiorNumber: "",
  references: "",
};

export type Line = { productId: string; variantCode: string; quantity: number };

/** Simula al navegador: cotiza si hace falta y envía el checkout con el total que ve. */
export async function checkout(lines: Line[], opts: { postalCode?: string; expectedTotalCents?: number; checkoutKey?: string; email?: string } = {}) {
  const priced = await priceCart(db, lines, { maxQuantityPerItem: 10 });
  let quoteId: string | null = null;
  let shipping = 0;
  if (priced.requiresShipping) {
    const q = await quoteShipping({ postalCode: opts.postalCode ?? ADDRESS.postalCode, cartHash: priced.shippingCartHash, items: priced.physicalComponents });
    quoteId = q[0].id;
    shipping = q[0].costCents;
  }
  const result: CheckoutResult = await createOrderAndCheckout({
    checkoutKey: opts.checkoutKey ?? randomUUID().replace(/-/g, ""),
    lines,
    customer: { name: "Persona Prueba", email: opts.email ?? "persona@example.com", phone: "8112345678" },
    address: priced.requiresShipping ? { ...ADDRESS, postalCode: opts.postalCode ?? ADDRESS.postalCode } : null,
    shippingQuoteId: quoteId,
    expectedTotalCents: opts.expectedTotalCents ?? priced.subtotalCents + shipping,
    acceptTerms: true,
    analyticsConsent: false,
    sessionId: `sess-${randomUUID()}`,
    device: "mobile",
  });
  return { result, priced, shipping, quoteId };
}

export async function orderByNumber(number: string) {
  const [o] = await db.select().from(orders).where(eq(orders.number, number));
  return o;
}
