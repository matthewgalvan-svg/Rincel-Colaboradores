import Link from "next/link";
import { PageHeader, Panel } from "@/components/admin/ui";
import { StatusBadge } from "@/components/order/StatusBadge";
import { shipmentQueue } from "@/lib/admin/queries";
import { requireStaffPage } from "@/lib/auth/guard";
import { SHIPPING_STATUS_LABELS } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { resolveShippingProvider } from "@/lib/shipping/service";

export const metadata = { title: "Envíos" };

export default async function EnviosPage() {
  await requireStaffPage("shipments.manage");
  const [rows, settings] = await Promise.all([shipmentQueue(), getSettings()]);
  const provider = resolveShippingProvider(settings);
  return (
    <>
      <PageHeader title="Envíos" description="Envíos abiertos. Una guía por envío; “Guía creada” no significa “Recolectado”." />
      <Panel className="mb-6">
        <p className="text-sm">
          Proveedor activo: <strong>{provider ? provider.label : "ninguno (compras físicas bloqueadas)"}</strong>
          {provider?.simulated ? " — SOLO DESARROLLO" : ""}. Creación automática de guías: <strong>{settings.shipping.autoCreateLabels && provider?.createLabel ? "activa" : "inactiva"}</strong>.
        </p>
      </Panel>
      <div className="overflow-x-auto rounded-2xl border border-borde/70 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-celeste-50 text-xs text-marino uppercase">
            <tr>
              <th className="px-3 py-2">Pedido</th>
              <th className="px-3 py-2">Pagado</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Guía</th>
              <th className="px-3 py-2">Alerta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde/60">
            {rows.map((r) => (
              <tr key={r.s.id}>
                <td className="px-3 py-2 font-bold">
                  <Link className="text-azul-700 hover:underline" href={`/admin/pedidos/${r.orderId}`}>
                    {r.number}
                  </Link>
                  {r.isTest ? <span className="ml-1 text-xs text-alerta">prueba</span> : null}
                </td>
                <td className="px-3 py-2">{formatDateTime(r.paidAt)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.s.status} label={SHIPPING_STATUS_LABELS[r.s.status]} /></td>
                <td className="px-3 py-2">{r.s.trackingNumber ? `${r.s.trackingNumber} (${r.s.carrier ?? "—"})` : "—"}</td>
                <td className="px-3 py-2 text-xs font-bold text-error">
                  {r.reviewRequired ? "Revisión pendiente: no enviar. " : ""}
                  {r.fulfillmentStatus === "on_hold" ? "Detenido. " : ""}
                  {r.s.lastError ? `Error de guía: ${r.s.lastError}` : ""}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-tinta-suave">
                  Sin envíos abiertos.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
