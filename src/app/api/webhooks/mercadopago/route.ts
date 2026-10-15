import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { PaymentsUnavailableError } from "@/lib/payments";
import { handlePaymentWebhook } from "@/lib/payments/webhook";

/**
 * Notificaciones de Mercado Pago (tópico "order"). Configura esta URL en el
 * panel de Tus integraciones → Webhooks: {APP_URL}/api/webhooks/mercadopago
 */
export async function POST(req: Request) {
  if (env().PAYMENT_PROVIDER !== "mercadopago") return NextResponse.json({ error: "no configurado" }, { status: 404 });
  const url = new URL(req.url);
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.length > 64_000) return NextResponse.json({ error: "demasiado grande" }, { status: 413 });
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  try {
    const r = await handlePaymentWebhook({ headers: req.headers, query: url.searchParams, body });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    if (err instanceof PaymentsUnavailableError) return NextResponse.json({ error: "no disponible" }, { status: 503 });
    console.error("webhook_error", err instanceof Error ? err.message : "desconocido");
    return NextResponse.json({ error: "reintentar" }, { status: 500 });
  }
}
