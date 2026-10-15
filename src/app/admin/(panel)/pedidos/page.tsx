import Link from "next/link";
import { PageHeader, inputCls } from "@/components/admin/ui";
import { StatusBadge } from "@/components/order/StatusBadge";
import { listOrders } from "@/lib/admin/queries";
import { can, requireStaffPage } from "@/lib/auth/guard";
import { ACTIVATION_STATUS_LABELS, FULFILLMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_STATUS_LABELS } from "@/lib/domain/types";
import { formatDateTime, formatMXN } from "@/lib/money";

export const metadata = { title: "Pedidos" };

export default async function PedidosAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaffPage("orders.read");
  const sp = await searchParams;
  const filters = {
    q: sp.q || undefined,
    payment: sp.pago || undefined,
    shipping: sp.envio || undefined,
    activation: sp.activacion || undefined,
    fulfillment: sp.prep || undefined,
    review: sp.revision === "1",
    includeTest: sp.pruebas === "1",
    from: sp.desde ? new Date(`${sp.desde}T00:00:00-06:00`) : undefined,
    to: sp.hasta ? new Date(`${sp.hasta}T23:59:59-06:00`) : undefined,
    page: Number(sp.p ?? 1) || 1,
  };
  const { rows, total, page, pageSize } = await listOrders(filters);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "p") as [string, string][]);
  const visible = rows;

  return (
    <>
      <PageHeader
        title="Pedidos"
        description={`${total} pedido${total === 1 ? "" : "s"}${filters.includeTest ? " (incluye pruebas)" : " (sin pruebas)"}`}
        actions={
          can(user, "orders.export") ? (
            <a href={`/api/admin/pedidos/export?${qs.toString()}`} className="btn-secondary min-h-10 px-4 text-sm">
              Exportar CSV
            </a>
          ) : null
        }
      />
      <form className="mb-5 grid gap-3 rounded-2xl border border-borde/70 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Número, correo, nombre o teléfono" className={`${inputCls} lg:col-span-2`} aria-label="Buscar" />
        <select name="pago" defaultValue={sp.pago ?? ""} className={inputCls} aria-label="Estado de pago">
          <option value="">Pago: todos</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="envio" defaultValue={sp.envio ?? ""} className={inputCls} aria-label="Estado de envío">
          <option value="">Envío: todos</option>
          {Object.entries(SHIPPING_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="activacion" defaultValue={sp.activacion ?? ""} className={inputCls} aria-label="Estado de activación">
          <option value="">Activación: todas</option>
          {Object.entries(ACTIVATION_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input type="date" name="desde" defaultValue={sp.desde} className={inputCls} aria-label="Desde" />
        <input type="date" name="hasta" defaultValue={sp.hasta} className={inputCls} aria-label="Hasta" />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="revision" value="1" defaultChecked={sp.revision === "1"} /> Con anomalía
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="pruebas" value="1" defaultChecked={sp.pruebas === "1"} /> Incluir pruebas
          </label>
        </div>
        <div className="flex gap-2 lg:col-span-4">
          <button className="btn-dark min-h-10 px-4 text-sm" type="submit">
            Filtrar
          </button>
          <Link href="/admin/pedidos" className="btn-ghost min-h-10 text-sm">
            Limpiar
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-borde/70 bg-white">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-celeste-50 text-xs text-marino uppercase">
            <tr>
              <th className="px-3 py-2">Pedido</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Pago</th>
              <th className="px-3 py-2">Preparación</th>
              <th className="px-3 py-2">Envío</th>
              <th className="px-3 py-2">Activación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde/60">
            {visible.map((o) => (
              <tr key={o.id} className={o.reviewRequired ? "bg-[#fdecea]/50" : "hover:bg-celeste-50/50"}>
                <td className="px-3 py-2 font-bold">
                  <Link href={`/admin/pedidos/${o.id}`} className="text-azul-700 hover:underline">
                    {o.number}
                  </Link>
                  {o.reviewRequired ? <span className="ml-1 text-xs font-extrabold text-error">⚠ revisión</span> : null}
                  {o.isTest ? <span className="ml-1 text-xs font-bold text-alerta">prueba</span> : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(o.createdAt)}</td>
                <td className="px-3 py-2">
                  {o.customerName}
                  <span className="block text-xs text-tinta-suave">{o.email}</span>
                </td>
                <td className="px-3 py-2 font-bold whitespace-nowrap">{formatMXN(o.totalCents)}</td>
                <td className="px-3 py-2"><StatusBadge status={o.paymentStatus} label={PAYMENT_STATUS_LABELS[o.paymentStatus]} /></td>
                <td className="px-3 py-2"><StatusBadge status={o.fulfillmentStatus} label={FULFILLMENT_STATUS_LABELS[o.fulfillmentStatus]} /></td>
                <td className="px-3 py-2"><StatusBadge status={o.shippingStatus} label={SHIPPING_STATUS_LABELS[o.shippingStatus]} /></td>
                <td className="px-3 py-2"><StatusBadge status={o.activationStatus} label={ACTIVATION_STATUS_LABELS[o.activationStatus]} /></td>
              </tr>
            ))}
            {!visible.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-tinta-suave">
                  Sin pedidos con estos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link className="btn-ghost min-h-10" href={`/admin/pedidos?${qs.toString()}&p=${page - 1}`}>
              ← Anterior
            </Link>
          ) : null}
          {page * pageSize < total ? (
            <Link className="btn-ghost min-h-10" href={`/admin/pedidos?${qs.toString()}&p=${page + 1}`}>
              Siguiente →
            </Link>
          ) : null}
        </span>
      </div>
    </>
  );
}
