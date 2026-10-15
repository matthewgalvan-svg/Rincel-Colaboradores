import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Token aleatorio no predecible (256 bits) codificado en base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

/** Comparación en tiempo constante de cadenas hex/ascii. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Número de pedido legible y único: RC-2610-7KQ4M (año/mes en Monterrey + 5 caracteres). */
export function generateOrderNumber(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey", year: "2-digit", month: "2-digit" }).formatToParts(now);
  const yy = parts.find((p) => p.type === "year")?.value ?? "00";
  const mm = parts.find((p) => p.type === "month")?.value ?? "00";
  const bytes = randomBytes(5);
  let suffix = "";
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `RC-${yy}${mm}-${suffix}`;
}

/** Hash del correo normalizado (para métricas sin PII). Usa un pepper si existe. */
export function hashEmail(email: string): string {
  const pepper = process.env.BETTER_AUTH_SECRET ?? "rincel-dev";
  return createHmac("sha256", pepper).update(email.trim().toLowerCase()).digest("hex");
}
