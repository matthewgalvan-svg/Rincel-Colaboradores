import "server-only";
import { env } from "@/lib/env";
import { mercadoPagoGateway } from "./mercadopago";
import { SIMULATED_RECEIVER_ID, simulatedGateway } from "./simulated";
import type { PaymentGateway } from "./types";

export class PaymentsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentsUnavailableError";
  }
}

let override: PaymentGateway | null = null;

/** Solo pruebas: inyecta una pasarela (p. ej. Mercado Pago con fetch simulado). */
export function setGatewayOverride(g: PaymentGateway | null) {
  override = g;
}

/**
 * Pasarela activa. Reglas de seguridad:
 * - "simulated" nunca en producción.
 * - Mercado Pago en modo producción exige PAYMENTS_LIVE_ENABLED=true (candado explícito).
 */
export function getGateway(): PaymentGateway {
  if (override) return override;
  const e = env();
  if (e.PAYMENT_PROVIDER === "simulated") {
    if (e.APP_ENV === "production") throw new PaymentsUnavailableError("Pagos simulados no permitidos en producción.");
    return simulatedGateway(e.APP_URL);
  }
  if (e.PAYMENT_PROVIDER === "mercadopago") {
    if (!e.MP_ACCESS_TOKEN || !e.MP_WEBHOOK_SECRET) throw new PaymentsUnavailableError("Faltan credenciales de Mercado Pago.");
    if (e.MP_ENVIRONMENT === "production" && !e.PAYMENTS_LIVE_ENABLED) throw new PaymentsUnavailableError("Los cobros reales no están habilitados (PAYMENTS_LIVE_ENABLED).");
    if (e.MP_ENVIRONMENT === "production" && !e.MP_USER_ID) throw new PaymentsUnavailableError("Falta MP_USER_ID para verificar la cuenta receptora.");
    return mercadoPagoGateway({ accessToken: e.MP_ACCESS_TOKEN, webhookSecret: e.MP_WEBHOOK_SECRET, apiBase: e.MP_API_BASE, environment: e.MP_ENVIRONMENT });
  }
  throw new PaymentsUnavailableError("No hay un proveedor de pagos configurado.");
}

/** Cuenta que debe recibir el dinero (null = no verificable en sandbox sin configurar). */
export function expectedReceiverId(gateway: PaymentGateway): string | null {
  if (gateway.id === "simulated") return SIMULATED_RECEIVER_ID;
  return env().MP_USER_ID ?? null;
}

export function paymentsAvailable(): { ok: true } | { ok: false; reason: string } {
  try {
    getGateway();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "No disponible" };
  }
}
