import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { simulatedProviderOrders } from "@/db/schema";
import { env } from "@/lib/env";
import { formatMXN } from "@/lib/money";
import { SimulatedActions } from "./actions-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pasarela simulada", robots: { index: false, follow: false } };

/** SOLO DESARROLLO: imita la pantalla de Mercado Pago para probar todos los resultados. */
export default async function PagoSimuladoPage({ params }: { params: Promise<{ id: string }> }) {
  const e = env();
  if (e.APP_ENV === "production" || e.PAYMENT_PROVIDER !== "simulated") notFound();
  const { id } = await params;
  const [o] = await db.select().from(simulatedProviderOrders).where(eq(simulatedProviderOrders.id, id)).limit(1);
  if (!o) notFound();
  return (
    <main className="min-h-dvh bg-[#f2f4f8] px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <p className="rounded-lg bg-[#fff6e5] px-3 py-2 text-sm font-bold text-alerta">PASARELA SIMULADA — solo desarrollo. No hay cobros reales.</p>
        <h1 className="mt-4 text-2xl">Pagar pedido {o.externalReference}</h1>
        <p className="mt-1 text-3xl font-extrabold">{formatMXN(o.totalCents)} MXN</p>
        <p className="mt-2 text-sm text-tinta-suave">Elige el resultado que quieres probar. Se notificará a la tienda igual que un webhook del proveedor.</p>
        <SimulatedActions id={o.id} />
      </div>
    </main>
  );
}
