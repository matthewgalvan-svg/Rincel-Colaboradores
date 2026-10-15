/** Utilidades de dinero. Todo importe se maneja en centavos enteros de MXN. */

const mxnWhole = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const mxnFixed = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $1,050 cuando no hay centavos; $230.50 cuando los hay (nunca $230.5). */
export function formatMXN(cents: number): string {
  return cents % 100 === 0 ? mxnWhole.format(cents / 100) : mxnFixed.format(cents / 100);
}

/** $1,050.00 — para comprobantes y tablas. */
export function formatMXNFixed(cents: number): string {
  return mxnFixed.format(cents / 100);
}

/** Convierte centavos a la cadena decimal que esperan las APIs ("1050.00"). */
export function centsToDecimalString(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("Los importes deben estar en centavos enteros.");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Convierte "1050.00" o 1050 a centavos sin errores de punto flotante. */
export function decimalToCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

export const TIMEZONE = "America/Monterrey";

const dateTime = new Intl.DateTimeFormat("es-MX", { timeZone: TIMEZONE, dateStyle: "long", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("es-MX", { timeZone: TIMEZONE, dateStyle: "medium" });

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateTime.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateOnly.format(typeof d === "string" ? new Date(d) : d);
}
