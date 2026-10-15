import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { StatusBadge } from "@/components/order/StatusBadge";
import { activationQueue, staffUsers } from "@/lib/admin/queries";
import { requireStaffPage } from "@/lib/auth/guard";
import { ACTIVATION_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/money";

export const metadata = { title: "Activaciones" };

export default async function ActivacionesPage() {
  await requireStaffPage("activations.manage");
  const [rows, users] = await Promise.all([activationQueue(), staffUsers()]);
  return (
    <>
      <PageHeader title="Activaciones" description="Gestión manual por personal autorizado. Comprar no activa líneas automáticamente; no hay API de activación conectada." />
      <div className="overflow-x-auto rounded-2xl border border-borde/70 bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-celeste-50 text-xs text-marino uppercase">
            <tr>
              <th className="px-3 py-2">Pedido</th>
              <th className="px-3 py-2">Línea</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Pago</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Responsable</th>
              <th className="px-3 py-2">Desde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde/60">
            {rows.map((r) => (
              <tr key={r.a.id} className={r.reviewRequired ? "bg-[#fdecea]/50" : ""}>
                <td className="px-3 py-2 font-bold">
                  <Link className="text-azul-700 hover:underline" href={`/admin/pedidos/${r.a.orderId}`}>
                    {r.number}
                  </Link>
                  {r.isTest ? <span className="ml-1 text-xs text-alerta">prueba</span> : null}
                </td>
                <td className="px-3 py-2">
                  {r.a.kind} · {r.a.simType === "esim" ? "eSIM" : "chip"} #{r.a.lineIndex + 1}
                </td>
                <td className="px-3 py-2">
                  {r.customerName}
                  <span className="block text-xs text-tinta-suave">{r.phone}</span>
                </td>
                <td className="px-3 py-2"><StatusBadge status={r.paymentStatus} label={PAYMENT_STATUS_LABELS[r.paymentStatus]} /></td>
                <td className="px-3 py-2"><StatusBadge status={r.a.status} label={ACTIVATION_STATUS_LABELS[r.a.status]} /></td>
                <td className="px-3 py-2">{users.find((u) => u.id === r.a.assignedTo)?.name ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.a.createdAt)}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-tinta-suave">
                  Sin activaciones pendientes.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
