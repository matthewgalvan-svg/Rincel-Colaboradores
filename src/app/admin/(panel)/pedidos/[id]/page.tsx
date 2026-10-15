import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, PageHeader, Panel, inputCls } from "@/components/admin/ui";
import { StatusBadge } from "@/components/order/StatusBadge";
import { orderDetail, staffUsers } from "@/lib/admin/queries";
import { can, requireStaffPage } from "@/lib/auth/guard";
import { ACTIVATION_STATUS_LABELS, FULFILLMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_STATUS_LABELS } from "@/lib/domain/types";
import { centsToDecimalString, formatDateTime, formatMXN } from "@/lib/money";
import { paymentTypeLabel } from "@/lib/orders/receipt";
import { getSettings } from "@/lib/settings";
import { resolveShippingProvider } from "@/lib/shipping/service";
import {
  activationAction,
  assignAction,
  autoLabelAction,
  cancelAction,
  esimReleaseAction,
  esimUploadAction,
  fulfillmentAction,
  manualLabelAction,
  noteAction,
  refundExecuteAction,
  refundRequestAction,
  resolveReviewAction,
  shipmentUpdateAction,
  syncPaymentAction,
} from "../actions";

export const metadata = { title: "Detalle de pedido" };

export default async function PedidoAdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("orders.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await orderDetail(id);
  if (!d) notFound();
  const [users, settings] = await Promise.all([staffUsers(), getSettings()]);
  const provider = resolveShippingProvider(settings);
  const o = d.order;
  const isAdmin = user.role === "admin";
  const userName = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "—";
  const hidden = <input type="hidden" name="orderId" value={o.id} />;
  const addr = o.shippingAddress;

  return (
    <>
      <PageHeader
        title={`Pedido ${o.number}`}
        description={`Creado ${formatDateTime(o.createdAt)}${o.paidAt ? ` · pagado ${formatDateTime(o.paidAt)}` : ""} · ${o.paymentProvider} (${o.paymentEnvironment})${o.isTest ? " · PRUEBA" : ""}`}
        actions={
          d.receipt ? (
            <a className="btn-secondary min-h-10 px-4 text-sm" href={`/api/admin/pedidos/${o.id}/comprobante`}>
              Comprobante PDF
            </a>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge status={o.paymentStatus} label={`Pago: ${PAYMENT_STATUS_LABELS[o.paymentStatus]}`} />
        <StatusBadge status={o.fulfillmentStatus} label={`Preparación: ${FULFILLMENT_STATUS_LABELS[o.fulfillmentStatus]}`} />
        <StatusBadge status={o.shippingStatus} label={`Envío: ${SHIPPING_STATUS_LABELS[o.shippingStatus]}`} />
        <StatusBadge status={o.activationStatus} label={`Activación: ${ACTIVATION_STATUS_LABELS[o.activationStatus]}`} />
      </div>

      {o.reviewRequired ? (
        <div className="mb-6 rounded-2xl border border-error/40 bg-[#fdecea] p-4">
          <p className="font-extrabold text-error">⚠ Requiere revisión: no preparar, enviar ni activar hasta resolver.</p>
          <p className="mt-1 text-sm text-error">{o.reviewReason}</p>
          {isAdmin ? (
            <ActionForm action={resolveReviewAction} submitLabel="Marcar como resuelta" className="mt-3" confirm="¿Confirmas que la anomalía está resuelta?">
              {hidden}
              <input name="note" className={inputCls} placeholder="Qué se verificó o decidió (p. ej. reembolso, existencias repuestas)" required />
            </ActionForm>
          ) : (
            <p className="mt-2 text-xs text-error">Un administrador debe resolverla.</p>
          )}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Cliente">
          {can(user, "customers.pii") ? (
            <dl className="grid gap-1 text-sm">
              <div><dt className="inline font-bold">Nombre: </dt><dd className="inline">{o.customerName}</dd></div>
              <div><dt className="inline font-bold">Correo: </dt><dd className="inline">{o.email}</dd></div>
              <div><dt className="inline font-bold">Teléfono: </dt><dd className="inline">{o.phone}</dd></div>
              {addr ? (
                <div>
                  <dt className="font-bold">Entrega:</dt>
                  <dd>
                    {addr.recipient} · {addr.phone}
                    <br />
                    {addr.street} {addr.exteriorNumber}
                    {addr.interiorNumber ? ` int. ${addr.interiorNumber}` : ""}, {addr.neighborhood}, {addr.municipality}, {addr.state}, CP {addr.postalCode}
                    {addr.references ? <><br />Ref.: {addr.references}</> : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-tinta-suave">Datos del cliente restringidos.</p>
          )}
          <ActionForm action={assignAction} submitLabel="Asignar" className="mt-4">
            {hidden}
            <Field label="Responsable">
              <select name="assignedTo" defaultValue={o.assignedTo ?? ""} className={inputCls}>
                <option value="">Sin asignar</option>
                {users.filter((u) => !u.banned).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </Panel>

        <Panel title="Artículos (copia al momento de compra)">
          <ul className="divide-y divide-borde/60 text-sm">
            {d.items.map((i) => (
              <li key={i.id} className="py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-bold">
                    {i.quantity} × {i.productName} · {i.variantLabel}
                  </span>
                  <span>{formatMXN(i.lineTotalCents)}</span>
                </div>
                <p className="text-xs text-tinta-suave">
                  {i.delivery === "digital" ? "Digital (eSIM)" : "Físico"} · {i.linesPerUnit ? `${i.linesPerUnit} línea(s) por unidad` : "sin líneas"} · precio unitario {formatMXN(i.unitPriceCents)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            Subtotal {formatMXN(o.subtotalCents)} · Envío {formatMXN(o.shippingCents)} {o.shippingMethodLabel ? `(${o.shippingMethodLabel})` : ""} · <strong>Total {formatMXN(o.totalCents)}</strong>
          </p>
          <p className="mt-1 text-xs text-tinta-suave">Reservas: {d.reservations.map((r) => `${r.componentId}×${r.quantity} (${r.status})`).join(", ") || "—"}</p>
        </Panel>

        <Panel title="Pagos" actions={<ActionForm action={syncPaymentAction} submitLabel="Consultar al proveedor" variant="secondary">{hidden}</ActionForm>}>
          {d.payments.length ? (
            <ul className="space-y-2 text-sm">
              {d.payments.map((p) => (
                <li key={p.id} className="rounded-lg bg-celeste-50 p-2">
                  <StatusBadge status={p.status} label={PAYMENT_STATUS_LABELS[p.status]} /> <span className="ml-1 font-bold">{formatMXN(p.paidAmountCents ?? p.amountCents)}</span> · {paymentTypeLabel(p.paymentType) ?? "—"} · ref. {p.providerPaymentId}
                  <span className="block text-xs text-tinta-suave">
                    {p.rawStatus}/{p.rawStatusDetail} · receptor {p.receiverId ?? "—"} · {p.currency ?? "—"}
                    {p.dateOfExpiration ? ` · vence ${formatDateTime(p.dateOfExpiration)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-tinta-suave">Sin transacciones registradas. Orden del proveedor: {o.providerOrderId ?? "—"}</p>
          )}
          {isAdmin && ["pending", "in_process", "rejected"].includes(o.paymentStatus) ? (
            <ActionForm action={cancelAction} submitLabel="Cancelar pedido" variant="danger" className="mt-4" confirm="¿Cancelar este pedido y liberar inventario?">
              {hidden}
              <input name="reason" className={inputCls} placeholder="Motivo de cancelación" required />
            </ActionForm>
          ) : null}
        </Panel>

        <Panel title="Preparación">
          <ActionForm action={fulfillmentAction} submitLabel="Actualizar">
            {hidden}
            <select name="status" defaultValue={o.fulfillmentStatus} className={inputCls} aria-label="Estado de preparación">
              <option value="pending">Por preparar</option>
              <option value="preparing">Preparando</option>
              <option value="ready">Listo</option>
              <option value="on_hold">Detener (en revisión)</option>
            </select>
          </ActionForm>
        </Panel>

        {o.requiresShipping ? (
          <Panel title="Envío" className="xl:col-span-2">
            {d.shipment ? (
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="text-sm">
                  <p>
                    <strong>Proveedor:</strong> {d.shipment.provider} · {d.shipment.serviceName ?? "—"} · {formatMXN(d.shipment.costCents)}
                  </p>
                  <p>
                    <strong>Guía:</strong> {d.shipment.trackingNumber ?? "sin guía"} {d.shipment.carrier ? `(${d.shipment.carrier})` : ""}
                  </p>
                  {d.shipment.trackingUrl ? (
                    <p>
                      <a className="link" href={d.shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                        Rastreo
                      </a>
                    </p>
                  ) : null}
                  {d.shipment.labelFileId ? (
                    <p>
                      <a className="link" href={`/api/admin/archivos/${d.shipment.labelFileId}`}>
                        Descargar guía (PDF privado)
                      </a>
                    </p>
                  ) : null}
                  {d.shipment.lastError ? <p className="mt-2 font-bold text-error">Error al crear guía ({d.shipment.labelAttempts} intento/s): {d.shipment.lastError}</p> : null}
                  <ol className="mt-3 space-y-1 border-l-2 border-celeste pl-3 text-xs">
                    {d.shipmentEvents.map((e) => (
                      <li key={e.id}>
                        <strong>{SHIPPING_STATUS_LABELS[e.status]}</strong> · {e.description} · {formatDateTime(e.occurredAt)} · {e.source}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="grid gap-4">
                  {!d.shipment.trackingNumber && provider?.createLabel ? (
                    <ActionForm action={autoLabelAction} submitLabel={`Crear guía con ${provider.label}`}>
                      {hidden}
                    </ActionForm>
                  ) : null}
                  {!d.shipment.trackingNumber ? (
                    <ActionForm action={manualLabelAction} submitLabel="Registrar guía manual">
                      {hidden}
                      <Field label="Paquetería">
                        <input name="carrier" className={inputCls} required />
                      </Field>
                      <Field label="Número de guía">
                        <input name="trackingNumber" className={inputCls} required />
                      </Field>
                      <Field label="Enlace de rastreo (https, opcional)">
                        <input name="trackingUrl" className={inputCls} type="url" />
                      </Field>
                      <Field label="PDF de la guía (opcional, privado)">
                        <input name="label" type="file" accept="application/pdf" className="text-sm" />
                      </Field>
                    </ActionForm>
                  ) : null}
                </div>
                <ActionForm action={shipmentUpdateAction} submitLabel="Registrar actualización">
                  {hidden}
                  <Field label="Nuevo estado (según la paquetería)">
                    <select name="status" className={inputCls}>
                      <option value="picked_up">Recolectado</option>
                      <option value="in_transit">En tránsito</option>
                      <option value="delivered">Entregado</option>
                      <option value="incident">Incidencia</option>
                      <option value="returned">Devuelto</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </Field>
                  <Field label="Detalle">
                    <input name="description" className={inputCls} maxLength={300} />
                  </Field>
                </ActionForm>
              </div>
            ) : (
              <p className="text-sm text-tinta-suave">El envío se crea al aprobarse el pago.</p>
            )}
          </Panel>
        ) : null}

        {d.activations.length ? (
          <Panel title="Activaciones (gestión manual)" className="xl:col-span-2">
            <p className="mb-3 text-xs text-tinta-suave">No solicitar NIP, contraseñas ni códigos por canales abiertos. Seguir el proceso confirmado por Rincel.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {d.activations.map((a, idx) => (
                <div key={a.id} className="rounded-xl border border-borde/70 p-3">
                  <p className="text-sm font-bold">
                    Línea {idx + 1} · {a.kind} · {a.simType === "esim" ? "eSIM" : "chip físico"} <StatusBadge status={a.status} label={ACTIVATION_STATUS_LABELS[a.status]} />
                  </p>
                  <p className="text-xs text-tinta-suave">Responsable: {userName(a.assignedTo)}</p>
                  <ActionForm action={activationAction} submitLabel="Guardar" className="mt-2">
                    {hidden}
                    <input type="hidden" name="activationId" value={a.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select name="status" defaultValue={a.status} className={inputCls} aria-label="Estado">
                        <option value="pending">Pendiente</option>
                        <option value="in_progress">En proceso</option>
                        <option value="activated">Activada</option>
                        <option value="incident">Incidencia</option>
                        <option value="cancelled">Cancelada</option>
                      </select>
                      <select name="assignedTo" defaultValue={a.assignedTo ?? ""} className={inputCls} aria-label="Responsable">
                        <option value="">Sin asignar</option>
                        {users.filter((u) => !u.banned).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input name="note" defaultValue={a.internalNote ?? ""} className={inputCls} placeholder="Nota interna" />
                  </ActionForm>
                  {a.simType === "esim" ? (
                    <div className="mt-3 grid gap-2 border-t border-borde/60 pt-3">
                      {a.esimFileId ? (
                        <p className="text-xs">
                          <a className="link" href={`/api/admin/archivos/${a.esimFileId}`}>
                            Ver archivo eSIM (privado)
                          </a>{" "}
                          · {a.esimAvailableToCustomer ? "visible para el cliente" : "no visible para el cliente"}
                        </p>
                      ) : null}
                      <ActionForm action={esimUploadAction} submitLabel="Cargar archivo eSIM">
                        {hidden}
                        <input type="hidden" name="activationId" value={a.id} />
                        <input name="esim" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="text-sm" />
                      </ActionForm>
                      {a.esimFileId ? (
                        <ActionForm action={esimReleaseAction} submitLabel={a.esimAvailableToCustomer ? "Retirar del cliente" : "Liberar al cliente"} variant="secondary">
                          {hidden}
                          <input type="hidden" name="activationId" value={a.id} />
                          <input type="hidden" name="available" value={a.esimAvailableToCustomer ? "0" : "1"} />
                        </ActionForm>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel title="Reembolsos">
          {d.refunds.length ? (
            <ul className="mb-3 space-y-2 text-sm">
              {d.refunds.map((r) => (
                <li key={r.id} className="rounded-lg bg-celeste-50 p-2">
                  <strong>{formatMXN(r.amountCents)}</strong> · {r.status} · {r.reason} · {formatDateTime(r.createdAt)}
                  {r.error ? <span className="block text-xs text-error">{r.error}</span> : null}
                  {isAdmin && (r.status === "requested" || r.status === "failed") ? (
                    <ActionForm action={refundExecuteAction} submitLabel="Ejecutar reembolso en el proveedor" variant="danger" className="mt-2" confirm="Se enviará el reembolso real al proveedor de pagos. ¿Continuar?">
                      {hidden}
                      <input type="hidden" name="refundId" value={r.id} />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" name="restock" value="1" /> Regresar existencias (solo reembolso total con mercancía devuelta)
                      </label>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {["approved", "partially_refunded"].includes(o.paymentStatus) ? (
            <ActionForm action={refundRequestAction} submitLabel="Solicitar reembolso">
              {hidden}
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="amount" className={inputCls} defaultValue={centsToDecimalString(o.totalCents)} aria-label="Importe" />
                <input name="reason" className={inputCls} placeholder="Motivo" required />
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-tinta-suave">Disponible para pedidos pagados.</p>
          )}
        </Panel>

        <Panel title="Notas internas e historial">
          <ActionForm action={noteAction} submitLabel="Agregar nota">
            {hidden}
            <textarea name="note" className={`${inputCls} min-h-20`} placeholder="Solo visible para el personal" />
          </ActionForm>
          <ol className="mt-4 max-h-96 space-y-2 overflow-y-auto text-sm">
            {d.events.map((e) => (
              <li key={e.id} className={`rounded-lg p-2 ${e.type === "nota_interna" ? "bg-[#fff6e5]" : e.type === "revision" ? "bg-[#fdecea]" : "bg-celeste-50"}`}>
                <span className="text-xs text-tinta-suave">
                  {formatDateTime(e.createdAt)} · {e.type}
                  {e.actorUserId ? ` · ${userName(e.actorUserId)}` : ""}
                  {e.visibleToCustomer ? " · visible al cliente" : ""}
                </span>
                <span className="block">{e.message}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Correos y solicitudes">
          <ul className="space-y-1 text-sm">
            {d.notifications.map((n) => (
              <li key={n.id}>
                {n.template} · <strong>{n.status}</strong> · {formatDateTime(n.createdAt)}
                {n.lastError ? <span className="text-xs text-tinta-suave"> ({n.lastError})</span> : null}
              </li>
            ))}
            {!d.notifications.length ? <li className="text-tinta-suave">Sin correos.</li> : null}
          </ul>
          {d.support.length ? (
            <ul className="mt-3 space-y-1 border-t border-borde/60 pt-3 text-sm">
              {d.support.map((s) => (
                <li key={s.id}>
                  <strong>{s.type}</strong> · {s.status} · {s.message.slice(0, 120)}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
