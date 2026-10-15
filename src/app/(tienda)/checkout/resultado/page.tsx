import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ClearCartOnMount } from "@/components/order/ClearCartOnMount";
import { CopyLink } from "@/components/order/CopyLink";
import { Icon } from "@/components/ui/Icon";
import { PAYMENT_STATUS_LABELS } from "@/lib/domain/types";
import { env } from "@/lib/env";
import { formatMXN } from "@/lib/money";
import { findOrderByToken, orderPrivateUrl } from "@/lib/orders/access";
import { refreshPaymentIfOpen } from "@/lib/orders/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resultado del pago", robots: { index: false, follow: false } };

export default async function ResultadoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const number = typeof sp.pedido === "string" ? sp.pedido : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  const found = await findOrderByToken(number, token);
  if (!found) {
    return (
      <div className="container-page max-w-2xl pt-12 text-center">
        <h1 className="text-3xl">No encontramos tu pedido</h1>
        <p className="mt-2 text-tinta-suave">El enlace no es válido o está incompleto. Puedes solicitar tu enlace privado con tu número de pedido y correo.</p>
        <Link href="/pedido" className="btn-primary mt-6">
          Consultar mi pedido
        </Link>
      </div>
    );
  }
  // El estado se consulta al proveedor desde el servidor. Los parámetros de retorno se ignoran.
  const order = await refreshPaymentIfOpen(found);
  const privateUrl = orderPrivateUrl(env().APP_URL, order);
  const s = order.paymentStatus;
  const canRetry = (s === "pending" || s === "rejected") && order.checkoutUrl && order.reservationExpiresAt && order.reservationExpiresAt > new Date();

  const content = {
    approved: { icon: "check" as const, tone: "bg-[#e7f6ee] text-exito", title: "¡Pago aprobado!", text: "Recibimos tu pago. Tu comprobante ya está disponible y nuestro equipo te contactará para la activación." },
    in_process: { icon: "clock" as const, tone: "bg-[#fff6e5] text-alerta", title: "Tu pago está en proceso", text: "Si elegiste efectivo o transferencia SPEI, completa el pago con la referencia de Mercado Pago antes de su vencimiento. Confirmaremos tu pedido cuando se acredite." },
    pending: { icon: "clock" as const, tone: "bg-[#fff6e5] text-alerta", title: "Aún no recibimos la confirmación del pago", text: "Si ya pagaste, la confirmación puede tardar unos minutos. Si no terminaste, puedes continuar con el pago." },
    rejected: { icon: "alert" as const, tone: "bg-[#fdecea] text-error", title: "El pago no se completó", text: "Mercado Pago rechazó el pago. No se te cobró este intento. Puedes intentarlo de nuevo con otro medio." },
    cancelled: { icon: "alert" as const, tone: "bg-[#fdecea] text-error", title: "El pago fue cancelado", text: "Este pedido ya no está activo. Puedes hacer una nueva compra cuando quieras." },
    expired: { icon: "alert" as const, tone: "bg-[#fdecea] text-error", title: "El plazo para pagar terminó", text: "Liberamos los productos apartados. Puedes hacer una nueva compra cuando quieras." },
  }[s as "approved" | "in_process" | "pending" | "rejected" | "cancelled" | "expired"] ?? {
    icon: "info" as const,
    tone: "bg-celeste text-marino",
    title: PAYMENT_STATUS_LABELS[s],
    text: "Consulta el detalle de tu pedido con tu enlace privado.",
  };

  return (
    <div className="container-page max-w-3xl pt-10 pb-10">
      <ClearCartOnMount />
      <div className="card overflow-hidden">
        <div className={`flex items-center gap-3 px-6 py-5 ${content.tone}`}>
          <Icon name={content.icon} className="h-8 w-8 shrink-0" />
          <div>
            <h1 className="text-2xl text-inherit">{content.title}</h1>
            <p className="font-semibold">Pedido {order.number}</p>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <p className="text-lg text-tinta-suave">{content.text}</p>
          <p className="text-sm">
            Total: <strong className="text-marino">{formatMXN(order.totalCents)} MXN</strong>
            {order.isTest ? <span className="ml-2 chip bg-[#fff6e5] text-alerta">Pedido de prueba</span> : null}
          </p>
          <div className="flex flex-wrap gap-3">
            {s === "approved" ? (
              <>
                <Link href={`/pedido/${order.number}/comprobante?t=${token}`} className="btn-primary">
                  <Icon name="download" /> Ver comprobante
                </Link>
                <a href={`/api/pedidos/${order.number}/comprobante?t=${token}`} className="btn-secondary">
                  Descargar PDF
                </a>
              </>
            ) : null}
            {canRetry ? (
              <a href={order.checkoutUrl!} className="btn-primary">
                {s === "rejected" ? "Intentar de nuevo" : "Continuar con el pago"}
                <Icon name="arrow" />
              </a>
            ) : null}
            <Link href={`/pedido/${order.number}?t=${token}`} className="btn-secondary">
              Ver mi pedido
            </Link>
            {s === "pending" || s === "in_process" ? (
              <Link href={`/checkout/resultado?pedido=${order.number}&t=${token}`} className="btn-ghost">
                Actualizar estado
              </Link>
            ) : null}
          </div>
          <div className="rounded-xl bg-celeste-50 p-4">
            <p className="font-extrabold text-marino">Guarda tu enlace privado</p>
            <p className="mb-3 text-sm text-tinta-suave">Con él consultas pago, envío y activación. También lo enviamos a {order.email.replace(/^(.).*(@.*)$/, "$1•••$2")}. No lo compartas.</p>
            <CopyLink url={privateUrl} />
          </div>
          {s === "approved" ? (
            <div className="flex items-center gap-4 rounded-xl border border-borde p-4">
              <Image src="/marca/rincelito.webp" alt="" width={64} height={71} className="h-16 w-auto" />
              <p className="text-sm text-tinta-suave">
                <strong className="text-marino">Siguiente paso:</strong> te contactaremos al teléfono o correo que registraste para la activación{order.requiresShipping ? " y el envío de tu pedido" : ""}. Nunca te pediremos tu NIP por chat abierto ni en esta página.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
