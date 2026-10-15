import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { FullLogo } from "@/components/brand/Logo";
import { PrintButton } from "@/components/order/PrintButton";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { formatDateTime, formatMXNFixed } from "@/lib/money";
import { findOrderByToken } from "@/lib/orders/access";
import type { ReceiptData } from "@/lib/orders/receipt";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comprobante de compra", robots: { index: false, follow: false } };

export default async function ComprobantePage({ params, searchParams }: { params: Promise<{ numero: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { numero } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const order = await findOrderByToken(decodeURIComponent(numero), token);
  const [receipt] = order ? await db.select().from(receipts).where(eq(receipts.orderId, order.id)).limit(1) : [];
  if (!order || !receipt) {
    return (
      <div className="container-page max-w-2xl pt-12 text-center">
        <h1 className="text-3xl">Comprobante no disponible</h1>
        <p className="mt-2 text-tinta-suave">El comprobante se genera cuando el pago está aprobado. Revisa tu pedido con tu enlace privado.</p>
        <Link href="/pedido" className="btn-primary mt-6">
          Consultar mi pedido
        </Link>
      </div>
    );
  }
  const r = receipt.data as unknown as ReceiptData;
  return (
    <div className="container-page max-w-3xl pt-8 pb-12 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <PrintButton />
        <a href={`/api/pedidos/${order.number}/comprobante?t=${token}`} className="btn-secondary min-h-11 text-sm">
          Descargar PDF
        </a>
        <Link href={`/pedido/${order.number}?t=${token}`} className="btn-ghost min-h-11 text-sm">
          Volver al pedido
        </Link>
      </div>
      <article className="card p-6 sm:p-10 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-borde/60 pb-6">
          <div>
            <FullLogo className="h-12 w-auto" />
            <p className="mt-2 text-sm font-extrabold text-morado">{r.sellerName}</p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl">Comprobante de compra</h1>
            <p className="text-sm text-tinta-suave">{r.receiptNumber}</p>
            {r.isTest ? <p className="mt-1 text-sm font-extrabold text-error">PRUEBA — SIN VALIDEZ COMERCIAL</p> : null}
          </div>
        </header>
        <dl className="grid gap-x-6 gap-y-2 py-6 text-sm sm:grid-cols-2">
          <div><dt className="font-bold text-marino">Pedido</dt><dd>{r.orderNumber}</dd></div>
          <div><dt className="font-bold text-marino">Fecha de emisión</dt><dd>{formatDateTime(r.issuedAt)}</dd></div>
          {r.paidAt ? <div><dt className="font-bold text-marino">Fecha de pago</dt><dd>{formatDateTime(r.paidAt)}</dd></div> : null}
          <div><dt className="font-bold text-marino">Cliente</dt><dd>{r.customerName}</dd></div>
          <div><dt className="font-bold text-marino">Medio de pago</dt><dd>{[r.paymentProvider, r.paymentMethod].filter(Boolean).join(" · ")}</dd></div>
          {r.paymentReference ? <div><dt className="font-bold text-marino">Referencia</dt><dd>{r.paymentReference}</dd></div> : null}
        </dl>
        <table className="w-full text-sm">
          <thead className="bg-celeste text-left text-marino">
            <tr>
              <th scope="col" className="px-3 py-2">Artículo</th>
              <th scope="col" className="px-3 py-2 text-right">Cant.</th>
              <th scope="col" className="px-3 py-2 text-right">Precio</th>
              <th scope="col" className="px-3 py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde/60">
            {r.items.map((it, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <span className="font-bold text-marino">{it.name}</span>
                  <span className="block text-xs text-tinta-suave">{it.variant}</span>
                </td>
                <td className="px-3 py-2 text-right">{it.quantity}</td>
                <td className="px-3 py-2 text-right">{formatMXNFixed(it.unitPriceCents)}</td>
                <td className="px-3 py-2 text-right">{formatMXNFixed(it.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMXNFixed(r.subtotalCents)}</dd></div>
          {r.discountCents > 0 ? <div className="flex justify-between"><dt>Descuentos</dt><dd>-{formatMXNFixed(r.discountCents)}</dd></div> : null}
          <div className="flex justify-between"><dt>Envío{r.shippingLabel ? ` (${r.shippingLabel})` : ""}</dt><dd>{r.shippingCents > 0 ? formatMXNFixed(r.shippingCents) : "No aplica"}</dd></div>
          <div className="flex justify-between border-t border-borde/60 pt-2 text-base font-extrabold text-marino"><dt>Total MXN</dt><dd>{formatMXNFixed(r.totalCents)}</dd></div>
        </dl>
        <footer className="mt-8 space-y-1 border-t border-borde/60 pt-4 text-xs text-tinta-suave">
          <p>Este documento es un comprobante de compra. No es un CFDI (factura electrónica) y no desglosa impuestos.</p>
          <p>Comprar no activa líneas automáticamente: la activación y la portabilidad se gestionan después del pago.</p>
        </footer>
      </article>
    </div>
  );
}
