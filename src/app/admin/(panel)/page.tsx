import Link from "next/link";
import { AlertLink, Kpi, PageHeader, Panel } from "@/components/admin/ui";
import { dashboardAlerts } from "@/lib/admin/queries";
import { computeStats } from "@/lib/admin/stats";
import { requireStaffPage } from "@/lib/auth/guard";
import { GLOBAL_PENDING } from "@/lib/catalog/seed-data";
import { formatMXN } from "@/lib/money";

export const metadata = { title: "Tablero" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const now = new Date();
  const [alerts, week] = await Promise.all([dashboardAlerts(), computeStats({ from: new Date(now.getTime() - 7 * 86400_000), to: now, includeTest: false })]);
  return (
    <>
      <PageHeader title={`Hola, ${user.name.split(" ")[0]}`} description="Resumen operativo. Los importes son facturación cobrada (no ganancia)." />
      {sp.error === "permiso" ? <p className="mb-4 rounded-xl bg-[#fdecea] px-4 py-3 text-sm font-bold text-error">No tienes permiso para esa sección.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Cobrado (7 días)" value={formatMXN(week.collectedCents)} hint="Sin pedidos de prueba" />
        <Kpi label="Pedidos pagados (7 días)" value={String(week.paidOrders)} />
        <Kpi label="Ticket promedio" value={week.avgTicketCents !== null ? formatMXN(week.avgTicketCents) : "Sin datos"} />
        <Kpi label="Conversión" value={week.conversion !== null ? `${(week.conversion * 100).toFixed(1)} %` : "Sin datos"} hint="Pedidos pagados / sesiones" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Requiere atención">
          <div className="grid gap-2">
            <AlertLink href="/admin/pedidos?revision=1" n={alerts.review} label="Pedidos con anomalía (revisión)" tone="bad" />
            <AlertLink href="/admin/pedidos?pago=approved&prep=pending" n={alerts.toPrepare} label="Pagados por preparar" />
            <AlertLink href="/admin/envios" n={alerts.failedLabels} label="Guías con error (reintentar)" tone="bad" />
            <AlertLink href="/admin/activaciones" n={alerts.pendingActivations} label="Activaciones pendientes o con incidencia" />
            <AlertLink href="/admin/solicitudes" n={alerts.openSupport} label="Solicitudes de clientes abiertas" />
            <AlertLink href="/admin/configuracion" n={alerts.failedNotifications} label="Correos no enviados (revisa proveedor de correo)" />
            <AlertLink href="/admin/configuracion" n={alerts.failedWebhooks} label="Notificaciones de pago rechazadas o fallidas (24 h)" tone="bad" />
            {alerts.lowStock.length ? (
              <Link href="/admin/inventario" className="rounded-xl bg-[#fff6e5] px-4 py-3 text-sm font-bold text-alerta hover:underline">
                Existencias bajas: {alerts.lowStock.map((c) => `${c.name} (${c.available})`).join(", ")}
              </Link>
            ) : null}
            {alerts.imageIssues.length ? (
              <Link href="/admin/productos" className="rounded-xl bg-[#fff6e5] px-4 py-3 text-sm font-bold text-alerta hover:underline">
                Imágenes comerciales por revisar: {alerts.imageIssues.map((p) => p.name).join(", ")}
              </Link>
            ) : null}
            {!alerts.review && !alerts.toPrepare && !alerts.failedLabels && !alerts.pendingActivations && !alerts.openSupport && !alerts.lowStock.length && !alerts.imageIssues.length ? <p className="text-sm text-tinta-suave">Todo en orden.</p> : null}
          </div>
        </Panel>
        <Panel title="Pendientes del negocio">
          <ul className="list-disc space-y-1 pl-5 text-sm text-tinta-suave">
            {GLOBAL_PENDING.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
