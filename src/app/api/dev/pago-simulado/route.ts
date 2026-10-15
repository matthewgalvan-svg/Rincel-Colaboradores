import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { simulatedProviderOrders } from "@/db/schema";
import { env } from "@/lib/env";
import { sameOrigin } from "@/lib/http";
import { syncProviderOrder } from "@/lib/payments/sync";

const schema = z.object({
  id: z.string().regex(/^SIMORD[A-F0-9]+$/),
  outcome: z.enum(["aprobar", "rechazar", "pendiente_efectivo", "pendiente_spei", "cancelar", "vencer"]),
});

const OUTCOMES = {
  aprobar: { status: "processed", statusDetail: "accredited", paymentType: "credit_card", paymentMethodId: "visa" },
  rechazar: { status: "failed", statusDetail: "cc_rejected_other_reason", paymentType: "credit_card", paymentMethodId: "visa" },
  pendiente_efectivo: { status: "action_required", statusDetail: "waiting_payment", paymentType: "ticket", paymentMethodId: "oxxo" },
  pendiente_spei: { status: "action_required", statusDetail: "waiting_transfer", paymentType: "bank_transfer", paymentMethodId: "spei" },
  cancelar: { status: "canceled", statusDetail: "canceled", paymentType: null, paymentMethodId: null },
  vencer: { status: "expired", statusDetail: "expired", paymentType: null, paymentMethodId: null },
} as const;

/** SOLO DESARROLLO: simula la decisión del comprador y la notificación del proveedor. */
export async function POST(req: Request) {
  const e = env();
  if (e.APP_ENV === "production" || e.PAYMENT_PROVIDER !== "simulated") return NextResponse.json({ error: "no disponible" }, { status: 404 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "inválido" }, { status: 400 });
  const o = OUTCOMES[parsed.data.outcome];
  const [row] = await db.update(simulatedProviderOrders).set(o).where(eq(simulatedProviderOrders.id, parsed.data.id)).returning();
  if (!row) return NextResponse.json({ error: "no existe" }, { status: 404 });
  await syncProviderOrder({ providerOrderId: row.id, source: "webhook" });
  const urls = row.returnUrls;
  const back = parsed.data.outcome === "aprobar" ? urls.success : parsed.data.outcome.startsWith("pendiente") ? urls.pending : urls.failure;
  return NextResponse.json({ ok: true, redirect: back });
}
