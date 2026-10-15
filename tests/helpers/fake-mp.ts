import { createHmac } from "node:crypto";
import { mercadoPagoGateway } from "@/lib/payments/mercadopago";

export const FAKE_TOKEN = "TEST-access-token";
export const FAKE_SECRET = "test-webhook-secret";
export const FAKE_RECEIVER = "123456789";

interface FakeOrder {
  id: string;
  type: string;
  status: string;
  status_detail: string;
  external_reference: string;
  total_amount: string;
  total_paid_amount?: string;
  currency?: string;
  country_code: string;
  user_id: string;
  checkout_url: string;
  items: { title: string; unit_price: string; quantity: number }[];
  transactions: { payments: Record<string, unknown>[]; refunds: Record<string, unknown>[] };
}

/**
 * Doble de prueba de la API de Orders de Mercado Pago (en memoria). Reproduce
 * la forma de las respuestas para ejercitar el adaptador real sin red.
 */
export function createFakeMercadoPago() {
  const orders = new Map<string, FakeOrder>();
  const byKey = new Map<string, string>();
  let n = 0;
  const calls: { method: string; path: string; idempotencyKey: string | null }[] = [];

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({ method, path: url.pathname, idempotencyKey: headers.get("X-Idempotency-Key") });
    if (headers.get("Authorization") !== `Bearer ${FAKE_TOKEN}`) return json(401, { message: "unauthorized" });

    if (method === "POST" && url.pathname === "/v1/orders") {
      const key = headers.get("X-Idempotency-Key");
      if (!key) return json(400, { message: "X-Idempotency-Key requerido" });
      if (byKey.has(key)) return json(201, orders.get(byKey.get(key)!));
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const items = body.items as { title: string; unit_price: string; quantity: number }[];
      const sum = items.reduce((s, i) => s + Math.round(Number(i.unit_price) * 100) * i.quantity, 0);
      if (body.type !== "online" || sum !== Math.round(Number(body.total_amount) * 100)) return json(400, { message: "invalid order" });
      const id = `ORD01TEST${String(++n).padStart(6, "0")}`;
      const order: FakeOrder = {
        id,
        type: "online",
        status: "created",
        status_detail: "created",
        external_reference: String(body.external_reference),
        total_amount: String(body.total_amount),
        country_code: "MEX",
        user_id: FAKE_RECEIVER,
        checkout_url: `https://www.mercadopago.com.mx/checkout/v1/redirect?order-id=${id}`,
        items,
        transactions: { payments: [], refunds: [] },
      };
      orders.set(id, order);
      byKey.set(key, id);
      return json(201, order);
    }
    const get = /^\/v1\/orders\/([^/]+)$/.exec(url.pathname);
    if (method === "GET" && get) {
      const o = orders.get(decodeURIComponent(get[1]));
      return o ? json(200, o) : json(404, { message: "not found" });
    }
    const refund = /^\/v1\/orders\/([^/]+)\/refund$/.exec(url.pathname);
    if (method === "POST" && refund) {
      const o = orders.get(decodeURIComponent(refund[1]));
      if (!o || o.status !== "processed") return json(400, { message: "cannot refund" });
      const body = init?.body ? (JSON.parse(String(init.body)) as { transactions?: { amount: string }[] }) : {};
      const amount = body.transactions?.[0]?.amount ?? o.total_amount;
      o.transactions.refunds.push({ id: `REF${o.transactions.refunds.length + 1}`, status: "processed", amount });
      const refunded = o.transactions.refunds.reduce((s, r) => s + Number(r.amount), 0);
      if (refunded >= Number(o.total_amount)) {
        o.status = "refunded";
        o.status_detail = "refunded";
      } else {
        o.status_detail = "partially_refunded";
      }
      return json(201, o);
    }
    return json(404, { message: "not found" });
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    orders,
    gateway: (environment: "sandbox" | "production" = "sandbox") => mercadoPagoGateway({ accessToken: FAKE_TOKEN, webhookSecret: FAKE_SECRET, apiBase: "https://api.mercadopago.test", environment, fetchImpl }),
    /** Simula lo que hace el comprador en Checkout Pro. */
    pay(id: string, p: { status: string; detail: string; type?: string; method?: string; amount?: string; userId?: string; currency?: string; expiresAt?: string }) {
      const o = orders.get(id);
      if (!o) throw new Error(`orden falsa ${id} inexistente`);
      o.status = p.status;
      o.status_detail = p.detail;
      if (p.userId) o.user_id = p.userId;
      if (p.currency) o.currency = p.currency;
      if (p.amount) o.total_amount = p.amount;
      const paid = p.status === "processed" ? (p.amount ?? o.total_amount) : "0.00";
      o.total_paid_amount = paid;
      o.transactions.payments = [
        {
          id: `PAY${id.slice(-6)}`,
          status: p.status,
          status_detail: p.detail,
          amount: p.amount ?? o.total_amount,
          paid_amount: paid,
          payment_method: { id: p.method ?? "visa", type: p.type ?? "credit_card" },
          ...(p.expiresAt ? { date_of_expiration: p.expiresAt } : {}),
        },
      ];
    },
  };
}

/** Construye una notificación firmada como la envía Mercado Pago. */
export function signedNotification(dataId: string, requestId: string, opts: { secret?: string; ts?: string; liveMode?: boolean; type?: string } = {}) {
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", opts.secret ?? FAKE_SECRET).update(manifest).digest("hex");
  const headers = new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId, "content-type": "application/json" });
  const query = new URLSearchParams({ "data.id": dataId, type: opts.type ?? "order" });
  const body = { action: "order.processed", type: opts.type ?? "order", live_mode: opts.liveMode ?? false, data: { id: dataId } };
  return { headers, query, body };
}
