import { Kpi, PageHeader, Panel, inputCls } from "@/components/admin/ui";
import { computeStats, previousRange } from "@/lib/admin/stats";
import { requireStaffPage } from "@/lib/auth/guard";
import { formatMXN } from "@/lib/money";
import { paymentTypeLabel } from "@/lib/orders/receipt";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/types";

export const metadata = { title: "Estadísticas" };

function pct(v: number | null) {
  return v === null ? "Sin datos" : `${(v * 100).toFixed(1)} %`;
}

function delta(cur: number | null, prev: number | null, money = false) {
  if (cur === null || prev === null) return null;
  if (prev === 0) return cur === 0 ? "Sin cambio vs. periodo anterior" : "Periodo anterior sin datos";
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)} % vs. periodo anterior (${money ? formatMXN(prev) : prev})`;
}

function mtyDate(s: string | undefined, fallback: Date, end = false) {
  return s ? new Date(`${s}T${end ? "23:59:59.999" : "00:00:00"}-06:00`) : fallback;
}

export default async function EstadisticasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage("stats.read");
  const sp = await searchParams;
  const now = new Date();
  const range = { from: mtyDate(sp.desde, new Date(now.getTime() - 30 * 86400_000)), to: mtyDate(sp.hasta, now, true), includeTest: sp.pruebas === "1" };
  const [s, p] = await Promise.all([computeStats(range), computeStats(previousRange(range))]);
  const toInput = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(d);
  const empty = <p className="text-sm text-tinta-suave">Sin datos en el periodo.</p>;

  return (
    <>
      <PageHeader title="Estadísticas" description="Facturación cobrada no es ganancia: la utilidad requiere costos, comisiones y envíos; el ROAS requiere la inversión publicitaria real (no integrada)." />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-borde/70 bg-white p-4 text-sm">
        <label className="grid gap-1">
          <span className="font-bold">Desde</span>
          <input type="date" name="desde" defaultValue={toInput(range.from)} className={inputCls} />
        </label>
        <label className="grid gap-1">
          <span className="font-bold">Hasta</span>
          <input type="date" name="hasta" defaultValue={toInput(range.to)} className={inputCls} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pruebas" value="1" defaultChecked={range.includeTest} /> Incluir datos de prueba
        </label>
        <button type="submit" className="btn-dark min-h-10 px-4 text-sm">
          Aplicar
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ventas cobradas" value={formatMXN(s.collectedCents)} delta={delta(s.collectedCents, p.collectedCents, true)} hint="Total de pedidos con pago acreditado en el periodo" />
        <Kpi label="Pedidos pagados" value={String(s.paidOrders)} delta={delta(s.paidOrders, p.paidOrders)} />
        <Kpi label="Ticket promedio" value={s.avgTicketCents !== null ? formatMXN(s.avgTicketCents) : "Sin datos"} delta={delta(s.avgTicketCents, p.avgTicketCents, true)} />
        <Kpi label="Reembolsos" value={`${s.refunds.count} · ${formatMXN(s.refunds.amountCents)}`} delta={delta(s.refunds.amountCents, p.refunds.amountCents, true)} />
        <Kpi label="Sesiones" value={s.sessions ? String(s.sessions) : "Sin datos"} delta={delta(s.sessions, p.sessions)} hint="Identificador aleatorio; 30 min de inactividad = nueva sesión" />
        <Kpi label="Conversión a compra pagada" value={pct(s.conversion)} hint="Pedidos pagados / sesiones" />
        <Kpi label="Abandono de checkout" value={pct(s.checkoutAbandonment)} hint="Sesiones que iniciaron checkout sin compra pagada en el periodo" />
        <Kpi label="Abandono de carrito" value={pct(s.cartAbandonment)} hint="Sesiones que agregaron al carrito sin iniciar checkout" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Embudo (eventos)">
          <ul className="space-y-1 text-sm">
            <li>Vistas de producto: <strong>{s.funnel.views}</strong></li>
            <li>Agregar al carrito: <strong>{s.funnel.addToCart}</strong></li>
            <li>Inicio de checkout: <strong>{s.funnel.beginCheckout}</strong></li>
            <li>Pago iniciado: <strong>{s.funnel.paymentStarted}</strong></li>
            <li>Compras (pago aprobado, una por pedido): <strong>{s.funnel.purchases}</strong></li>
          </ul>
        </Panel>
        <Panel title="Pagos por estado">
          {s.paymentsByStatus.length ? (
            <ul className="space-y-1 text-sm">
              {s.paymentsByStatus.map((x) => (
                <li key={x.status}>
                  {PAYMENT_STATUS_LABELS[x.status as PaymentStatus] ?? x.status}: <strong>{x.n}</strong>
                </li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </Panel>
        <Panel title="Medios de pago (aprobados)">
          {s.paymentMethods.length ? (
            <ul className="space-y-1 text-sm">
              {s.paymentMethods.map((x) => (
                <li key={x.type}>
                  {paymentTypeLabel(x.type) ?? x.type}: <strong>{x.n}</strong> · {formatMXN(x.amountCents)}
                </li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </Panel>
        <Panel title="Unidades y ventas por producto">
          {s.byProduct.length ? (
            <ul className="space-y-1 text-sm">
              {s.byProduct.map((x) => (
                <li key={x.productId}>
                  {x.name}: <strong>{x.units}</strong> u · {formatMXN(x.amountCents)}
                </li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </Panel>
        <Panel title="Origen (UTM / referencia)">
          {s.bySource.length ? (
            <ul className="space-y-1 text-sm">
              {s.bySource.map((x) => (
                <li key={x.source}>
                  {x.source}: <strong>{x.orders}</strong> pedidos · {formatMXN(x.amountCents)}
                </li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </Panel>
        <Panel title="Dispositivo">
          {s.byDevice.length ? (
            <ul className="space-y-1 text-sm">
              {s.byDevice.map((x) => (
                <li key={x.device}>
                  {x.device}: <strong>{x.sessions}</strong> sesiones · <strong>{x.orders}</strong> pedidos pagados
                </li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </Panel>
        <Panel title="Clics en CTA y WhatsApp">
          <p className="text-sm">WhatsApp: <strong>{s.whatsappClicks}</strong></p>
          {s.ctaClicks.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {s.ctaClicks.map((x) => (
                <li key={x.cta}>
                  {x.cta}: <strong>{x.n}</strong>
                </li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </Panel>
        <Panel title="Operación">
          <ul className="space-y-1 text-sm">
            <li>Errores de cotización: {s.quoteErrors.length ? s.quoteErrors.map((q) => `${q.code} (${q.n})`).join(", ") : "0"}</li>
            <li>Fallas al crear guía: <strong>{s.labelFailures}</strong></li>
            <li>Preparación promedio (pago → guía): <strong>{s.prepHoursAvg !== null ? `${s.prepHoursAvg.toFixed(1)} h` : "Sin datos"}</strong></li>
            <li>Entrega promedio (guía → entregado): <strong>{s.deliveryHoursAvg !== null ? `${s.deliveryHoursAvg.toFixed(1)} h` : "Sin datos"}</strong></li>
            <li>Clientes nuevos / recurrentes (por correo seudonimizado): <strong>{s.newCustomers}</strong> / <strong>{s.returningCustomers}</strong></li>
          </ul>
        </Panel>
      </div>
      <p className="mt-6 text-xs text-tinta-suave">Utilidad y ROAS: sin datos (requieren costos, comisiones, envíos e inversión publicitaria reales).</p>
    </>
  );
}
