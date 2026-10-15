import { desc, inArray } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, PageHeader, Panel, inputCls } from "@/components/admin/ui";
import { db } from "@/db";
import { notifications, webhookEvents } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth/guard";
import { GLOBAL_PENDING } from "@/lib/catalog/seed-data";
import { env } from "@/lib/env";
import { centsToDecimalString, formatDateTime } from "@/lib/money";
import { paymentsAvailable } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { resolveShippingProvider } from "@/lib/shipping/service";
import { MX_STATES } from "@/content/mx";
import { retryEmailsAction, runJobsAction, saveOriginAction, saveSettingsAction } from "./actions";

export const metadata = { title: "Configuración" };

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex gap-2 text-sm">
      <span className={`mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full ${ok ? "bg-exito" : "bg-alerta"}`} aria-hidden="true" />
      <span>
        <strong>{label}:</strong> {detail}
      </span>
    </li>
  );
}

export default async function ConfiguracionPage() {
  await requireStaffPage("settings.manage");
  const [s, hooks, mails] = await Promise.all([
    getSettings(),
    db.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(15),
    db.select().from(notifications).where(inArray(notifications.status, ["failed", "skipped"])).orderBy(desc(notifications.createdAt)).limit(15),
  ]);
  const e = env();
  const pay = paymentsAvailable();
  const ship = resolveShippingProvider(s);

  return (
    <>
      <PageHeader title="Configuración" description="Los secretos (llaves de Mercado Pago, correo, analítica) solo se configuran en variables de entorno del servidor y nunca se muestran aquí." />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Tienda, contacto y banners">
          <ActionForm action={saveSettingsAction} submitLabel="Guardar configuración">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre del vendedor">
                <input name="sellerName" defaultValue={s.sellerName} className={inputCls} required />
              </Field>
              <Field label="WhatsApp (formato internacional, solo dígitos)" hint="Vacío = no se muestra. Ej. 52 + número a 10 dígitos.">
                <input name="whatsappNumber" defaultValue={s.contact.whatsappNumber ?? ""} className={inputCls} inputMode="numeric" />
              </Field>
              <Field label="Mensaje inicial de WhatsApp">
                <input name="whatsappMessage" defaultValue={s.contact.whatsappMessage} className={inputCls} />
              </Field>
              <Field label="Correo de atención">
                <input name="contactEmail" type="email" defaultValue={s.contact.email ?? ""} className={inputCls} />
              </Field>
              <Field label="Teléfono de atención">
                <input name="contactPhone" defaultValue={s.contact.phone ?? ""} className={inputCls} />
              </Field>
              <Field label="Horario de atención">
                <input name="contactHours" defaultValue={s.contact.hours ?? ""} className={inputCls} />
              </Field>
              <Field label="Título del inicio">
                <input name="heroTitle" defaultValue={s.home.heroTitle} className={inputCls} required />
              </Field>
              <Field label="Subtítulo del inicio">
                <input name="heroSubtitle" defaultValue={s.home.heroSubtitle} className={inputCls} />
              </Field>
              <Field label="CTA principal">
                <input name="primaryCta" defaultValue={s.home.primaryCta} className={inputCls} required />
              </Field>
              <Field label="CTA secundario">
                <input name="secondaryCta" defaultValue={s.home.secondaryCta} className={inputCls} required />
              </Field>
            </div>
            <fieldset className="rounded-xl border border-borde/70 p-3">
              <legend className="px-1 text-sm font-bold">Aviso superior (banner)</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="announcementEnabled" value="1" defaultChecked={s.announcement.enabled} /> Mostrar
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input name="announcementText" defaultValue={s.announcement.text} className={inputCls} placeholder="Texto (sin urgencias falsas)" />
                <input name="announcementHref" defaultValue={s.announcement.href ?? ""} className={inputCls} placeholder="/producto/... (opcional)" />
              </div>
            </fieldset>
            <fieldset className="rounded-xl border border-borde/70 p-3">
              <legend className="px-1 text-sm font-bold">Envío manual (alternativa explícita)</legend>
              <p className="mb-2 text-xs text-tinta-suave">Tarifa fija configurada por el negocio cuando no hay paquetería integrada. Requiere SHIPPING_PROVIDER=manual. No es una cotización automática.</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="manualEnabled" value="1" defaultChecked={s.shipping.manual.enabled} /> Habilitar
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input name="manualLabel" defaultValue={s.shipping.manual.label} className={inputCls} placeholder="Nombre del servicio" />
                <input name="manualCost" defaultValue={centsToDecimalString(s.shipping.manual.costCents)} className={inputCls} placeholder="Costo MXN" />
                <input name="manualDays" defaultValue={s.shipping.manual.estimatedDays} className={inputCls} placeholder="Tiempo estimado (texto)" />
                <input name="manualDescription" defaultValue={s.shipping.manual.description} className={inputCls} placeholder="Descripción" />
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Crear guías automáticamente">
                <select name="autoCreateLabels" defaultValue={s.shipping.autoCreateLabels ? "1" : "0"} className={inputCls}>
                  <option value="0">No</option>
                  <option value="1">Sí (si el proveedor lo permite)</option>
                </select>
              </Field>
              <Field label="Vigencia de cotización (min)">
                <input name="quoteTtl" type="number" defaultValue={s.shipping.quoteTtlMinutes} className={inputCls} />
              </Field>
              <Field label="Peso del empaque (g)">
                <input name="packagingWeight" type="number" defaultValue={s.shipping.packagingWeightGrams ?? ""} className={inputCls} />
              </Field>
              <Field label="Apartado de inventario (min)">
                <input name="reservationMinutes" type="number" defaultValue={s.checkout.reservationMinutes} className={inputCls} />
              </Field>
              <Field label="Máximo para pagos en efectivo/SPEI (h)">
                <input name="pendingHours" type="number" defaultValue={s.checkout.pendingPaymentMaxHours} className={inputCls} />
              </Field>
              <Field label="Máximo por producto">
                <input name="maxQty" type="number" defaultValue={s.checkout.maxQuantityPerItem} className={inputCls} />
              </Field>
            </div>
          </ActionForm>
        </Panel>

        <div className="grid h-fit gap-6">
          <Panel title="Integraciones (estado)">
            <ul className="grid gap-2">
              <Status ok={pay.ok && e.PAYMENT_PROVIDER === "mercadopago"} label="Pagos" detail={pay.ok ? `${e.PAYMENT_PROVIDER} · ${e.PAYMENT_PROVIDER === "mercadopago" ? `${e.MP_ENVIRONMENT}${e.MP_ENVIRONMENT === "production" ? (e.PAYMENTS_LIVE_ENABLED ? " · cobros reales habilitados" : " · cobros reales BLOQUEADOS") : ""}` : "solo desarrollo"}` : pay.reason} />
              <Status ok={Boolean(e.MP_WEBHOOK_SECRET)} label="Firma de webhooks" detail={e.MP_WEBHOOK_SECRET ? "configurada" : "pendiente"} />
              <Status ok={Boolean(e.MP_USER_ID)} label="Cuenta receptora" detail={e.MP_USER_ID ? "configurada (se verifica en cada pago)" : "pendiente (obligatoria en producción)"} />
              <Status ok={Boolean(ship && !ship.simulated)} label="Envíos" detail={ship ? ship.label : "sin método: compras físicas bloqueadas"} />
              <Status ok={Boolean(e.SMTP_URL && e.EMAIL_FROM)} label="Correo" detail={e.SMTP_URL && e.EMAIL_FROM ? "SMTP configurado" : "pendiente (los correos quedan como omitidos)"} />
              <Status ok={Boolean(e.GA4_MEASUREMENT_ID || e.META_PIXEL_ID)} label="Analítica externa" detail={[e.GA4_MEASUREMENT_ID ? "GA4" : null, e.META_PIXEL_ID ? "Meta" : null].filter(Boolean).join(" + ") || "no configurada (solo medición propia)"} />
              <Status ok={Boolean(e.CRON_SECRET)} label="Trabajos programados" detail={e.CRON_SECRET ? "endpoint protegido configurado" : "pendiente (CRON_SECRET)"} />
            </ul>
            <p className="mt-3 text-xs text-tinta-suave">URL de notificaciones para Mercado Pago (tópico Order): {e.APP_URL}/api/webhooks/mercadopago</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionForm action={runJobsAction} submitLabel="Ejecutar conciliación ahora" variant="secondary" />
              <ActionForm action={retryEmailsAction} submitLabel="Reintentar correos" variant="secondary" />
            </div>
          </Panel>

          <Panel title="Dirección de origen (envíos)">
            <ActionForm action={saveOriginAction} submitLabel="Guardar origen">
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="name" defaultValue={s.shipping.origin?.name ?? ""} className={inputCls} placeholder="Remitente" />
                <input name="phone" defaultValue={s.shipping.origin?.phone ?? ""} className={inputCls} placeholder="Teléfono" />
                <input name="postalCode" defaultValue={s.shipping.origin?.postalCode ?? ""} className={inputCls} placeholder="CP" />
                <select name="state" defaultValue={s.shipping.origin?.state ?? ""} className={inputCls} aria-label="Estado">
                  <option value="">Estado…</option>
                  {MX_STATES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <input name="municipality" defaultValue={s.shipping.origin?.municipality ?? ""} className={inputCls} placeholder="Municipio" />
                <input name="neighborhood" defaultValue={s.shipping.origin?.neighborhood ?? ""} className={inputCls} placeholder="Colonia" />
                <input name="street" defaultValue={s.shipping.origin?.street ?? ""} className={inputCls} placeholder="Calle" />
                <input name="exteriorNumber" defaultValue={s.shipping.origin?.exteriorNumber ?? ""} className={inputCls} placeholder="Número" />
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Pendientes del negocio">
            <ul className="list-disc space-y-1 pl-5 text-sm text-tinta-suave">
              {GLOBAL_PENDING.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel title="Notificaciones de pago recientes" className="xl:col-span-2">
          <ul className="space-y-1 text-xs">
            {hooks.map((h) => (
              <li key={h.id}>
                {formatDateTime(h.receivedAt)} · {h.provider} · {h.topic ?? "—"} · {h.resourceId ?? "—"} · <strong>{h.status}</strong>
                {h.signatureValid ? "" : " · firma inválida"}
                {h.error ? ` · ${h.error}` : ""}
              </li>
            ))}
            {!hooks.length ? <li className="text-tinta-suave">Sin notificaciones.</li> : null}
          </ul>
        </Panel>
        <Panel title="Correos no enviados" className="xl:col-span-2">
          <ul className="space-y-1 text-xs">
            {mails.map((m) => (
              <li key={m.id}>
                {formatDateTime(m.createdAt)} · {m.template} · {m.status} · {m.lastError}
              </li>
            ))}
            {!mails.length ? <li className="text-tinta-suave">Todo enviado.</li> : null}
          </ul>
        </Panel>
      </div>
    </>
  );
}
