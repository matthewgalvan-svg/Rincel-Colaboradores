import "server-only";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { db, type DbOrTx } from "@/db";
import { notifications } from "@/db/schema";
import { env } from "@/lib/env";
import { formatMXN } from "@/lib/money";

export type NotificationTemplate = "pedido_creado" | "pago_aprobado" | "pago_pendiente" | "envio_actualizado" | "esim_lista" | "enlace_pedido" | "alerta_admin";

interface Rendered {
  subject: string;
  text: string;
}

/** Plantillas en texto plano: sin datos sensibles más allá de lo necesario. */
function render(template: NotificationTemplate, p: Record<string, unknown>): Rendered {
  const seller = String(p.sellerName ?? "Rincel Colaboradores");
  const num = String(p.orderNumber ?? "");
  const link = p.orderUrl ? `\n\nConsulta tu pedido (enlace privado, no lo compartas):\n${p.orderUrl}` : "";
  switch (template) {
    case "pedido_creado":
      return {
        subject: `Recibimos tu pedido ${num} — pendiente de pago`,
        text: `Hola ${p.customerName ?? ""}:\n\nRegistramos tu pedido ${num} por ${formatMXN(Number(p.totalCents ?? 0))}. Está pendiente de pago: se confirma únicamente cuando Mercado Pago acredite el pago.${link}\n\n${seller}`,
      };
    case "pago_pendiente":
      return {
        subject: `Pago en proceso — pedido ${num}`,
        text: `Hola ${p.customerName ?? ""}:\n\nTu pago del pedido ${num} quedó en proceso. Si elegiste efectivo o transferencia, completa el pago con la referencia que te dio Mercado Pago antes de su vencimiento. Te avisaremos cuando se acredite.${link}\n\n${seller}`,
      };
    case "pago_aprobado":
      return {
        subject: `Pago aprobado — pedido ${num}`,
        text: `Hola ${p.customerName ?? ""}:\n\n¡Gracias! Tu pago por ${formatMXN(Number(p.totalCents ?? 0))} fue aprobado. Tu comprobante está disponible en tu pedido. La activación de líneas no es automática: nuestro equipo te contactará para continuar.${link}\n\n${seller}`,
      };
    case "envio_actualizado":
      return {
        subject: `Actualización de envío — pedido ${num}`,
        text: `Hola ${p.customerName ?? ""}:\n\nEl envío de tu pedido ${num} cambió a: ${p.statusLabel ?? ""}.${p.tracking ? `\nGuía: ${p.tracking}` : ""}${link}\n\n${seller}`,
      };
    case "esim_lista":
      return {
        subject: `Tu eSIM está lista — pedido ${num}`,
        text: `Hola ${p.customerName ?? ""}:\n\nLa información de tu eSIM ya está disponible en tu pedido. Ábrela solo desde tu enlace privado.${link}\n\n${seller}`,
      };
    case "enlace_pedido":
      return {
        subject: `Enlace para consultar tu pedido ${num}`,
        text: `Hola:\n\nSolicitaste el enlace de consulta de tu pedido ${num}.${link}\n\nSi no fuiste tú, ignora este mensaje.\n\n${seller}`,
      };
    case "alerta_admin":
      return { subject: `[Alerta] ${p.title ?? "Revisión requerida"}`, text: `${p.message ?? ""}\n\nPedido: ${num}` };
  }
}

export async function enqueueNotification(
  tx: DbOrTx,
  n: { orderId?: string | null; template: NotificationTemplate; recipient: string; payload: Record<string, unknown>; dedupKey: string },
) {
  await tx
    .insert(notifications)
    .values({ orderId: n.orderId ?? null, channel: "email", template: n.template, recipient: n.recipient, payload: n.payload, status: "pending", dedupKey: n.dedupKey })
    .onConflictDoNothing();
}

let transport: Transporter | null = null;
function getTransport() {
  const e = env();
  if (!e.SMTP_URL || !e.EMAIL_FROM) return null;
  transport ??= nodemailer.createTransport(e.SMTP_URL);
  return transport;
}

/** Envía la bandeja de salida (reintentos hasta 5 veces). */
export async function processNotifications(opts: { orderId?: string; limit?: number } = {}) {
  const t = getTransport();
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        or(eq(notifications.status, "pending"), and(eq(notifications.status, "failed"), lt(notifications.attempts, 5))),
        opts.orderId ? eq(notifications.orderId, opts.orderId) : undefined,
      ),
    )
    .limit(opts.limit ?? 50);
  let sent = 0;
  for (const n of rows) {
    if (!t) {
      // Sin proveedor configurado: se marca como omitida (visible en el panel), no se finge el envío.
      await db.update(notifications).set({ status: "skipped", lastError: "Proveedor de correo no configurado." }).where(eq(notifications.id, n.id));
      continue;
    }
    const r = render(n.template as NotificationTemplate, n.payload);
    try {
      await t.sendMail({ from: env().EMAIL_FROM, to: n.recipient, subject: r.subject, text: r.text });
      await db.update(notifications).set({ status: "sent", sentAt: new Date(), attempts: n.attempts + 1, lastError: null }).where(eq(notifications.id, n.id));
      sent++;
    } catch (err) {
      await db
        .update(notifications)
        .set({ status: "failed", attempts: n.attempts + 1, lastError: err instanceof Error ? err.message.slice(0, 300) : "Error" })
        .where(eq(notifications.id, n.id));
    }
  }
  return { processed: rows.length, sent };
}

/** Reintenta notificaciones omitidas cuando ya se configuró el correo. */
export async function requeueSkipped(ids: string[]) {
  if (!ids.length) return;
  await db.update(notifications).set({ status: "pending" }).where(inArray(notifications.id, ids));
}

export { render as renderNotification };
