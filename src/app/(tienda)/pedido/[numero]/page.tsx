import type { Metadata } from "next";
import Link from "next/link";
import { CopyLink } from "@/components/order/CopyLink";
import { StatusBadge } from "@/components/order/StatusBadge";
import { Icon } from "@/components/ui/Icon";
import { ACTIVATION_STATUS_LABELS, FULFILLMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_STATUS_LABELS } from "@/lib/domain/types";
import { env } from "@/lib/env";
import { formatDateTime, formatMXN } from "@/lib/money";
import { findOrderByToken, orderPrivateUrl } from "@/lib/orders/access";
import { customerOrderView, refreshPaymentIfOpen } from "@/lib/orders/view";
import { SupportRequestForm } from "./support-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi pedido", robots: { index: false, follow: false } };

const KIND_LABEL: Record<string, string> = { portabilidad: "Portabilidad", linea_nueva: "Línea nueva", datos: "Chip de datos" };

export default async function PedidoPage({ params, searchParams }: { params: Promise<{ numero: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { numero } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const found = await findOrderByToken(decodeURIComponent(numero), token);
  if (!found) {
    return (
      <div className="container-page max-w-2xl pt-12 text-center">
        <h1 className="text-3xl">No pudimos abrir este pedido</h1>
        <p className="mt-2 text-tinta-suave">Por seguridad, cada pedido se consulta con su enlace privado. Si lo perdiste, solicítalo con tu número de pedido y correo.</p>
        <Link href="/pedido" className="btn-primary mt-6">
          Solicitar mi enlace
        </Link>
      </div>
    );
  }
  const order = await refreshPaymentIfOpen(found);
  const v = await customerOrderView(order.id);
  const privateUrl = orderPrivateUrl(env().APP_URL, order);
  const canPay = (order.paymentStatus === "pending" || order.paymentStatus === "rejected") && order.checkoutUrl && order.reservationExpiresAt && order.reservationExpiresAt > new Date();
  const addr = order.shippingAddress;

  const statusCards = [
    { title: "Pago", status: order.paymentStatus, label: PAYMENT_STATUS_LABELS[order.paymentStatus], icon: "card" as const },
    { title: "Preparación", status: order.fulfillmentStatus, label: FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus], icon: "store" as const },
    { title: "Envío", status: order.shippingStatus, label: SHIPPING_STATUS_LABELS[order.shippingStatus], icon: "truck" as const },
    { title: "Activación", status: order.activationStatus, label: ACTIVATION_STATUS_LABELS[order.activationStatus], icon: "phone" as const },
  ];

  return (
    <div className="container-page max-w-4xl pt-8 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-tinta-suave">Pedido</p>
          <h1 className="text-3xl">{order.number}</h1>
          <p className="text-sm text-tinta-suave">Creado el {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.isTest ? <span className="chip bg-[#fff6e5] text-alerta">Pedido de prueba</span> : null}
          {order.paymentStatus === "approved" && v.receipt ? (
            <Link href={`/pedido/${order.number}/comprobante?t=${token}`} className="btn-secondary min-h-11 text-sm">
              <Icon name="download" className="h-4 w-4" /> Comprobante
            </Link>
          ) : null}
          {canPay ? (
            <a href={order.checkoutUrl!} className="btn-primary min-h-11 text-sm">
              Pagar ahora
            </a>
          ) : null}
        </div>
      </div>

      <section aria-label="Estados" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {statusCards.map((c) => (
          <div key={c.title} className="card p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-tinta-suave">
              <Icon name={c.icon} className="h-4 w-4" /> {c.title}
            </p>
            <div className="mt-2">
              <StatusBadge status={c.status} label={c.label} />
            </div>
          </div>
        ))}
      </section>
      {order.paymentStatus === "in_process" ? <p className="mt-3 text-sm text-tinta-suave">Si pagaste en efectivo o SPEI, tu pedido se confirmará cuando Mercado Pago acredite el pago.</p> : null}
      {order.activationStatus === "pending" ? <p className="mt-3 text-sm text-tinta-suave">La activación no es automática: nuestro equipo te contactará al {order.phone.replace(/.(?=.{4})/g, "•")}.</p> : null}

      <div className="mt-8 grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <section className="card p-5" aria-labelledby="art">
          <h2 id="art" className="text-xl">
            Artículos
          </h2>
          <ul className="mt-4 divide-y divide-borde/60">
            {v.items.map((i) => (
              <li key={i.id} className="py-3">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-bold text-marino">
                      {i.quantity} × {i.productName}
                    </p>
                    <p className="text-sm text-tinta-suave">{i.variantLabel}</p>
                    {i.snapshot.priceNote ? <p className="text-xs text-tinta-suave">{i.snapshot.priceNote}</p> : null}
                  </div>
                  <p className="font-bold whitespace-nowrap">{formatMXN(i.lineTotalCents)}</p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-borde/60 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Subtotal</dt>
              <dd>{formatMXN(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Envío{order.shippingMethodLabel ? ` (${order.shippingMethodLabel})` : ""}</dt>
              <dd>{order.requiresShipping ? formatMXN(order.shippingCents) : "No aplica"}</dd>
            </div>
            <div className="flex justify-between text-base font-extrabold text-marino">
              <dt>Total</dt>
              <dd>{formatMXN(order.totalCents)} MXN</dd>
            </div>
          </dl>
        </section>

        <div className="space-y-6">
          {order.requiresShipping ? (
            <section className="card p-5" aria-labelledby="envio">
              <h2 id="envio" className="text-xl">
                Envío
              </h2>
              {addr ? (
                <address className="mt-3 text-sm not-italic text-tinta-suave">
                  {addr.recipient}
                  <br />
                  {addr.street} {addr.exteriorNumber}
                  {addr.interiorNumber ? ` int. ${addr.interiorNumber}` : ""}, {addr.neighborhood}
                  <br />
                  {addr.municipality}, {addr.state}, CP {addr.postalCode}
                </address>
              ) : null}
              {v.shipment?.trackingNumber ? (
                <p className="mt-3 text-sm">
                  Guía <strong>{v.shipment.trackingNumber}</strong>
                  {v.shipment.carrier ? ` · ${v.shipment.carrier}` : ""}
                  {v.shipment.trackingUrl ? (
                    <>
                      {" · "}
                      <a href={v.shipment.trackingUrl} className="link" target="_blank" rel="noopener noreferrer">
                        Rastrear
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
              {order.shippingStatus === "label_created" ? <p className="mt-2 text-xs text-tinta-suave">“Guía creada” significa que ya generamos la etiqueta; la paquetería aún no recolecta el paquete.</p> : null}
              {v.shipmentEvents.length ? (
                <ol className="mt-4 space-y-3 border-l-2 border-celeste pl-4 text-sm">
                  {v.shipmentEvents.map((e) => (
                    <li key={e.id}>
                      <p className="font-bold text-marino">{SHIPPING_STATUS_LABELS[e.status]}</p>
                      <p className="text-tinta-suave">{e.description}</p>
                      <p className="text-xs text-tinta-suave">{formatDateTime(e.occurredAt)}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ) : null}

          {v.activations.length ? (
            <section className="card p-5" aria-labelledby="activ">
              <h2 id="activ" className="text-xl">
                Activación
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {v.activations.map((a, idx) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Línea {idx + 1}: {KIND_LABEL[a.kind] ?? a.kind} · {a.simType === "esim" ? "eSIM" : "chip físico"}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={a.status} label={ACTIVATION_STATUS_LABELS[a.status]} />
                      {a.esimAvailable ? (
                        <a className="link" href={`/api/pedidos/${order.number}/esim/${a.id}?t=${token}`}>
                          Descargar eSIM
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      {v.events.length ? (
        <section className="mt-8" aria-labelledby="hist">
          <h2 id="hist" className="text-xl">
            Historial
          </h2>
          <ol className="mt-3 space-y-2 text-sm">
            {v.events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-40 shrink-0 text-tinta-suave">{formatDateTime(e.createdAt)}</span>
                <span>{e.message}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mt-8 rounded-xl bg-celeste-50 p-4">
        <p className="font-extrabold text-marino">Tu enlace privado</p>
        <p className="mb-3 text-sm text-tinta-suave">Guárdalo y no lo compartas: permite consultar este pedido.</p>
        <CopyLink url={privateUrl} />
      </section>

      {order.paymentStatus === "approved" || order.paymentStatus === "partially_refunded" ? (
        <section className="mt-8" aria-labelledby="ayuda">
          <h2 id="ayuda" className="text-xl">
            ¿Algo salió mal?
          </h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Solicita una devolución, reembolso o reporta una incidencia. Consulta la{" "}
            <Link className="link" href="/politicas/devoluciones">
              política de devoluciones
            </Link>
            .
          </p>
          <SupportRequestForm number={order.number} token={token} />
        </section>
      ) : null}
    </div>
  );
}
