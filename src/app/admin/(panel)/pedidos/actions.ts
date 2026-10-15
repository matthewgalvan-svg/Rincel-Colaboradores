"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/admin/ActionForm";
import {
  addInternalNote,
  assignOrder,
  attachEsim,
  cancelOpenOrder,
  executeRefund,
  OpError,
  recordShipmentUpdate,
  registerManualLabel,
  requestRefund,
  resolveReview,
  setEsimAvailability,
  setFulfillmentStatus,
  updateActivation,
} from "@/lib/admin/order-ops";
import { ForbiddenError, requirePermission } from "@/lib/auth/guard";
import { decimalToCents } from "@/lib/money";
import { syncProviderOrder } from "@/lib/payments/sync";
import { createLabelForOrder } from "@/lib/shipping/service";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";

const uuid = z.uuid();

async function run(fn: () => Promise<string | void>, orderId?: string): Promise<ActionResult> {
  try {
    const msg = await fn();
    if (orderId) revalidatePath(`/admin/pedidos/${orderId}`);
    revalidatePath("/admin/pedidos");
    return { ok: true, message: msg || "Guardado." };
  } catch (err) {
    if (err instanceof OpError || err instanceof ForbiddenError) return { ok: false, message: err.message };
    if (err instanceof z.ZodError) return { ok: false, message: "Datos inválidos." };
    console.error("admin_action_error", err instanceof Error ? err.message : err);
    return { ok: false, message: "No se pudo completar la acción." };
  }
}

async function fileFrom(form: FormData, key: string) {
  const f = form.get(key);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_UPLOAD_BYTES) throw new OpError("El archivo excede 8 MB.");
  return { data: Buffer.from(await f.arrayBuffer()), filename: f.name, mimeType: f.type };
}

export async function fulfillmentAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("orders.update");
    const status = z.enum(["pending", "preparing", "ready", "on_hold"]).parse(form.get("status"));
    await setFulfillmentStatus(orderId, status, user);
  }, orderId);
}

export async function manualLabelAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("shipments.manage");
    const carrier = z.string().trim().min(2).max(60).parse(form.get("carrier"));
    const trackingNumber = z.string().trim().min(4).max(60).parse(form.get("trackingNumber"));
    const trackingUrl = z.string().trim().max(300).parse(form.get("trackingUrl") ?? "") || null;
    const pdf = await fileFrom(form, "label");
    await registerManualLabel(orderId, { carrier, trackingNumber, trackingUrl, labelPdf: pdf }, user);
    return "Guía registrada.";
  }, orderId);
}

export async function autoLabelAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("shipments.manage");
    const r = await createLabelForOrder(orderId, { actorUserId: user.id });
    if (r.status !== "created") throw new OpError(r.message);
    return r.message;
  }, orderId);
}

export async function shipmentUpdateAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("shipments.manage");
    const status = z.enum(["picked_up", "in_transit", "delivered", "incident", "returned", "cancelled"]).parse(form.get("status"));
    const description = z.string().trim().max(300).parse(form.get("description") ?? "");
    await recordShipmentUpdate(orderId, { status, description }, user);
    return "Envío actualizado y cliente notificado.";
  }, orderId);
}

export async function activationAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("activations.manage");
    const id = uuid.parse(form.get("activationId"));
    const status = z.enum(["pending", "in_progress", "activated", "incident", "cancelled"]).parse(form.get("status"));
    const note = z.string().trim().max(1000).parse(form.get("note") ?? "");
    const assignedTo = z.string().max(64).parse(form.get("assignedTo") ?? "") || null;
    await updateActivation(id, { status, internalNote: note || null, assignedTo }, user);
  }, orderId);
}

export async function esimUploadAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("activations.manage");
    const id = uuid.parse(form.get("activationId"));
    const file = await fileFrom(form, "esim");
    if (!file) throw new OpError("Selecciona el archivo (PDF o imagen).");
    await attachEsim(id, file, user);
    return "Archivo cargado (privado). Libéralo al cliente cuando esté validado.";
  }, orderId);
}

export async function esimReleaseAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("activations.manage");
    const id = uuid.parse(form.get("activationId"));
    const available = form.get("available") === "1";
    await setEsimAvailability(id, available, user);
    return available ? "eSIM disponible para el cliente." : "eSIM retirada del cliente.";
  }, orderId);
}

export async function assignAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("orders.update");
    const to = z.string().max(64).parse(form.get("assignedTo") ?? "") || null;
    await assignOrder(orderId, to, user);
  }, orderId);
}

export async function noteAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("orders.update");
    await addInternalNote(orderId, z.string().max(2000).parse(form.get("note") ?? ""), user);
    return "Nota agregada.";
  }, orderId);
}

export async function resolveReviewAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("refunds.execute");
    await resolveReview(orderId, z.string().trim().min(5, "Describe la resolución.").max(500).parse(form.get("note") ?? ""), user);
    return "Revisión resuelta.";
  }, orderId);
}

export async function cancelAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("refunds.execute");
    await cancelOpenOrder(orderId, z.string().trim().min(3).max(300).parse(form.get("reason") ?? ""), user);
    return "Pedido cancelado e inventario liberado.";
  }, orderId);
}

export async function syncPaymentAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    await requirePermission("orders.update");
    const r = await syncProviderOrder({ orderId, source: "manual" });
    return `Consulta al proveedor: ${r.result}${"paymentStatus" in r ? ` (${r.paymentStatus})` : ""}${"reason" in r ? ` — ${r.reason}` : ""}`;
  }, orderId);
}

export async function refundRequestAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("refunds.request");
    const cents = decimalToCents(String(form.get("amount") ?? ""));
    if (!cents) throw new OpError("Escribe un importe válido (p. ej. 230.00).");
    await requestRefund(orderId, { amountCents: cents, reason: z.string().trim().min(3).max(500).parse(form.get("reason") ?? "") }, user);
    return "Reembolso solicitado. Un administrador debe ejecutarlo.";
  }, orderId);
}

export async function refundExecuteAction(_: ActionResult | null, form: FormData) {
  const orderId = uuid.parse(form.get("orderId"));
  return run(async () => {
    const user = await requirePermission("refunds.execute");
    const status = await executeRefund(uuid.parse(form.get("refundId")), { restock: form.get("restock") === "1" }, user);
    return `Reembolso enviado al proveedor: ${status}.`;
  }, orderId);
}
