import "server-only";
import { centsToDecimalString, decimalToCents } from "@/lib/money";
import { hmacSha256Hex, safeEqual } from "@/lib/security/tokens";
import type { PaymentStatus } from "@/lib/domain/types";
import {
  PaymentProviderError,
  type CheckoutSession,
  type CreateCheckoutInput,
  type PaymentGateway,
  type ProviderOrderState,
  type ProviderTransaction,
  type WebhookInput,
  type WebhookVerification,
} from "./types";

/**
 * Mercado Pago — Checkout Pro vía API de Orders (POST /v1/orders, type "online").
 * El comprador elige el medio de pago (tarjeta, SPEI, efectivo, según la cuenta)
 * dentro del entorno de Mercado Pago; aquí no se preselecciona ninguno.
 *
 * Referencias (verificar antes de producción):
 * - https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-orders/overview
 * - https://www.mercadopago.com.mx/developers/es/reference/orders/online-payments/create/post
 * - Notificaciones: tópico "order"; firma x-signature (HMAC-SHA256) con
 *   plantilla id:[data.id];request-id:[x-request-id];ts:[ts]; y data.id en minúsculas.
 */

export interface MercadoPagoConfig {
  accessToken: string;
  webhookSecret: string;
  apiBase: string;
  environment: "sandbox" | "production";
  fetchImpl?: typeof fetch;
}

/** Normaliza el estado de una orden o transacción de Orders a nuestro modelo. */
export function mapMpStatus(status: string | null | undefined, detail: string | null | undefined, hasTransactions = true): PaymentStatus {
  const s = (status ?? "").toLowerCase();
  const d = (detail ?? "").toLowerCase();
  switch (s) {
    case "processed":
    case "accredited":
    case "approved":
      if (d === "partially_refunded") return "partially_refunded";
      if (d === "refunded") return "refunded";
      if (d === "charged_back" || d === "chargeback") return "charged_back";
      return "approved";
    case "refunded":
      return d === "partially_refunded" ? "partially_refunded" : "refunded";
    case "partially_refunded":
      return "partially_refunded";
    case "charged_back":
    case "chargeback":
      return "charged_back";
    case "action_required":
    case "processing":
    case "in_review":
    case "in_process":
    case "waiting_payment":
    case "waiting_transfer":
    case "pending":
    case "authorized":
      return "in_process";
    case "created":
      return hasTransactions ? "in_process" : "pending";
    case "failed":
    case "rejected":
      return "rejected";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : typeof v === "number" ? String(v) : null;
}

/** Convierte la respuesta JSON de /v1/orders a nuestro estado normalizado. */
export function parseMpOrder(json: Record<string, unknown>): ProviderOrderState {
  const tx = (json.transactions ?? {}) as { payments?: Record<string, unknown>[]; refunds?: Record<string, unknown>[] };
  const transactions: ProviderTransaction[] = (tx.payments ?? []).map((p) => {
    const pm = (p.payment_method ?? {}) as Record<string, unknown>;
    return {
      id: str(p.id) ?? "",
      status: mapMpStatus(str(p.status), str(p.status_detail)),
      rawStatus: str(p.status),
      rawStatusDetail: str(p.status_detail),
      amountCents: decimalToCents(str(p.amount)),
      paidAmountCents: decimalToCents(str(p.paid_amount)),
      refundedAmountCents: decimalToCents(str(p.refunded_amount)),
      paymentMethodId: str(pm.id),
      paymentType: str(pm.type),
      dateOfExpiration: str(p.date_of_expiration) ? new Date(str(p.date_of_expiration)!) : null,
    };
  });
  const status = str(json.status);
  const detail = str(json.status_detail);
  return {
    providerOrderId: str(json.id) ?? "",
    status: mapMpStatus(status, detail, transactions.length > 0),
    rawStatus: status,
    rawStatusDetail: detail,
    externalReference: str(json.external_reference),
    totalAmountCents: decimalToCents(str(json.total_amount)),
    paidAmountCents: decimalToCents(str(json.total_paid_amount)),
    currency: str(json.currency),
    countryCode: str(json.country_code),
    receiverId: str(json.user_id),
    liveMode: typeof json.live_mode === "boolean" ? json.live_mode : null,
    transactions: transactions.filter((t) => t.id),
  };
}

function parseSignatureHeader(header: string | null): { ts: string | null; v1: string | null } {
  if (!header) return { ts: null, v1: null };
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const [k, ...rest] = part.split("=");
    const key = k?.trim();
    const value = rest.join("=").trim();
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }
  return { ts, v1 };
}

/** Plantilla oficial; los valores ausentes se omiten. */
export function buildSignatureManifest(dataId: string | null, requestId: string | null, ts: string | null): string {
  let manifest = "";
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  if (ts) manifest += `ts:${ts};`;
  return manifest;
}

export function verifyMpSignature(input: WebhookInput, secret: string): WebhookVerification {
  const requestId = input.headers.get("x-request-id");
  const { ts, v1 } = parseSignatureHeader(input.headers.get("x-signature"));
  if (!secret) return { valid: false, reason: "Falta MP_WEBHOOK_SECRET.", requestId };
  if (!ts || !v1) return { valid: false, reason: "Encabezado x-signature ausente o incompleto.", requestId };
  const body = (input.body ?? {}) as { data?: { id?: unknown }; type?: unknown; action?: unknown; live_mode?: unknown; topic?: unknown };
  const dataId = input.query.get("data.id") ?? str(body.data?.id);
  const expected = hmacSha256Hex(secret, buildSignatureManifest(dataId, requestId, ts));
  if (!safeEqual(expected, v1.toLowerCase())) return { valid: false, reason: "Firma inválida.", requestId };
  return {
    valid: true,
    topic: input.query.get("type") ?? str(body.type) ?? str(body.topic),
    action: str(body.action),
    resourceId: dataId,
    requestId,
    liveMode: typeof body.live_mode === "boolean" ? body.live_mode : null,
  };
}

export function mercadoPagoGateway(cfg: MercadoPagoConfig): PaymentGateway {
  const doFetch = cfg.fetchImpl ?? fetch;

  async function call(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await doFetch(`${cfg.apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch {
      throw new PaymentProviderError("No fue posible comunicarse con Mercado Pago.", true);
    }
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      // Nunca se registran credenciales; solo estado y mensaje del proveedor.
      const msg = typeof json.message === "string" ? json.message : `HTTP ${res.status}`;
      throw new PaymentProviderError(`Mercado Pago respondió con error: ${msg}`, res.status >= 500 || res.status === 429, res.status);
    }
    return json;
  }

  return {
    id: "mercadopago",
    environment: cfg.environment,

    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
      const itemsTotal = input.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
      if (itemsTotal !== input.totalCents) throw new PaymentProviderError("La suma de artículos no coincide con el total.", false);
      const body = {
        type: "online",
        processing_mode: "manual",
        external_reference: input.orderNumber,
        total_amount: centsToDecimalString(input.totalCents),
        description: `Pedido ${input.orderNumber} — Rincel Colaboradores`,
        // La orden vive lo mismo que un pago en efectivo/SPEI para no invalidar
        // referencias ya emitidas; el inventario se aparta por separado y un
        // pago tardío se revalida contra existencias (ver inventory/service.ts).
        expiration_time: `PT${Math.max(1, Math.round(Math.max(input.offlineDueHours, input.expiresInMinutes / 60)))}H`,
        payer: { email: input.payer.email, first_name: input.payer.firstName, last_name: input.payer.lastName },
        items: input.items.map((i) => ({
          title: i.title.slice(0, 120),
          unit_price: centsToDecimalString(i.unitPriceCents),
          quantity: i.quantity,
          external_code: i.externalCode,
        })),
        config: {
          default_payment_due_date: `PT${Math.max(1, Math.round(input.offlineDueHours))}H`,
          online: {
            success_url: input.returnUrls.success,
            failure_url: input.returnUrls.failure,
            pending_url: input.returnUrls.pending,
            auto_return: "all",
          },
        },
      };
      const json = await call("POST", "/v1/orders", body, input.idempotencyKey);
      const id = str(json.id);
      const url = str(json.checkout_url);
      if (!id || !url) throw new PaymentProviderError("Mercado Pago no devolvió el enlace de pago.", false);
      return { providerOrderId: id, checkoutUrl: url };
    },

    async getOrder(providerOrderId: string): Promise<ProviderOrderState> {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(providerOrderId)) throw new PaymentProviderError("Identificador de orden inválido.", false);
      return parseMpOrder(await call("GET", `/v1/orders/${encodeURIComponent(providerOrderId)}`));
    },

    async refund({ providerOrderId, transactionId, amountCents, idempotencyKey }) {
      const body = amountCents !== undefined && transactionId ? { transactions: [{ id: transactionId, amount: centsToDecimalString(amountCents) }] } : undefined;
      const json = await call("POST", `/v1/orders/${encodeURIComponent(providerOrderId)}/refund`, body, idempotencyKey);
      const refunds = ((json.transactions as { refunds?: Record<string, unknown>[] } | undefined)?.refunds ?? []).slice(-1);
      const r = refunds[0];
      const st = (str(r?.status) ?? str(json.status) ?? "").toLowerCase();
      return {
        providerRefundId: str(r?.id),
        status: st === "processed" || st === "approved" || st === "refunded" ? "approved" : st === "failed" || st === "rejected" ? "rejected" : "processing",
      };
    },

    verifyWebhook(input: WebhookInput) {
      return verifyMpSignature(input, cfg.webhookSecret);
    },
  };
}
