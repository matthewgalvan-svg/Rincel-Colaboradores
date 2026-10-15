import "server-only";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { orders } from "@/db/schema";
import { safeEqual } from "@/lib/security/tokens";

function secret() {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s && process.env.APP_ENV === "production") throw new Error("Falta BETTER_AUTH_SECRET.");
  return s ?? "dev-only-secret-change-me-dev-only-secret";
}

/** Token privado no predecible para consultar un pedido sin cuenta. */
export function orderAccessToken(orderId: string, salt: string): string {
  return createHmac("sha256", secret()).update(`order-access:${orderId}:${salt}`).digest("base64url");
}

export function orderPrivateUrl(appUrl: string, order: { id: string; number: string; accessSalt: string }) {
  return `${appUrl}/pedido/${encodeURIComponent(order.number)}?t=${orderAccessToken(order.id, order.accessSalt)}`;
}

/**
 * Busca un pedido por número + token. El número por sí solo nunca revela datos:
 * si el token no coincide se responde igual que si el pedido no existiera.
 */
export async function findOrderByToken(number: string, token: string | null | undefined, tx: DbOrTx = db) {
  if (!token || token.length < 20 || token.length > 100) return null;
  if (!/^RC-\d{4}-[A-Z0-9]{5}$/.test(number)) return null;
  const [order] = await tx.select().from(orders).where(eq(orders.number, number)).limit(1);
  if (!order) return null;
  return safeEqual(orderAccessToken(order.id, order.accessSalt), token) ? order : null;
}
