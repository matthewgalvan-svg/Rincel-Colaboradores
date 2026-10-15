"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/admin/ActionForm";
import { audit } from "@/lib/audit";
import { ForbiddenError, requirePermission } from "@/lib/auth/guard";
import { processNotifications } from "@/lib/notifications";
import { getSettings, saveSettings, type StoreSettings } from "@/lib/settings";
import { runJobs } from "@/lib/jobs";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const nullable = (f: FormData, k: string) => str(f, k) || null;

export async function saveSettingsAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("settings.manage");
    const before = await getSettings();
    const cost = Number(str(form, "manualCost").replace(/[$,\s]/g, "") || "0");
    const next: StoreSettings = {
      sellerName: str(form, "sellerName"),
      contact: {
        whatsappNumber: nullable(form, "whatsappNumber")?.replace(/\D/g, "") || null,
        whatsappMessage: str(form, "whatsappMessage"),
        email: nullable(form, "contactEmail"),
        phone: nullable(form, "contactPhone"),
        hours: nullable(form, "contactHours"),
      },
      home: { heroTitle: str(form, "heroTitle"), heroSubtitle: str(form, "heroSubtitle"), primaryCta: str(form, "primaryCta"), secondaryCta: str(form, "secondaryCta") },
      announcement: { enabled: form.get("announcementEnabled") === "1", text: str(form, "announcementText"), href: nullable(form, "announcementHref") },
      shipping: {
        manual: { enabled: form.get("manualEnabled") === "1", label: str(form, "manualLabel") || "Envío nacional", costCents: Math.round(cost * 100), estimatedDays: str(form, "manualDays"), description: str(form, "manualDescription") },
        autoCreateLabels: form.get("autoCreateLabels") === "1",
        quoteTtlMinutes: Number(str(form, "quoteTtl") || "30"),
        origin: before.shipping.origin,
        packagingWeightGrams: str(form, "packagingWeight") ? Number(str(form, "packagingWeight")) : null,
      },
      checkout: {
        reservationMinutes: Number(str(form, "reservationMinutes") || "60"),
        pendingPaymentMaxHours: Number(str(form, "pendingHours") || "72"),
        maxQuantityPerItem: Number(str(form, "maxQty") || "10"),
      },
    };
    if (next.announcement.href && !next.announcement.href.startsWith("/")) throw new Error("El enlace del aviso debe ser una ruta interna (inicia con /).");
    const saved = await saveSettings(next, user.id);
    await audit({ actor: user, action: "configuracion.guardada", entity: "settings", entityId: "store", before, after: saved });
    revalidatePath("/", "layout");
    return { ok: true, message: "Configuración guardada." };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    if (err instanceof z.ZodError) return { ok: false, message: `Revisa: ${err.issues.map((i) => i.path.join(".")).join(", ")}` };
    return { ok: false, message: err instanceof Error ? err.message : "No se pudo guardar." };
  }
}

export async function saveOriginAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("settings.manage");
    const s = await getSettings();
    const origin = {
      name: str(form, "name"),
      phone: str(form, "phone"),
      postalCode: str(form, "postalCode"),
      state: str(form, "state"),
      municipality: str(form, "municipality"),
      neighborhood: str(form, "neighborhood"),
      street: str(form, "street"),
      exteriorNumber: str(form, "exteriorNumber"),
    };
    if (!/^\d{5}$/.test(origin.postalCode)) throw new Error("Código postal de origen inválido.");
    await saveSettings({ ...s, shipping: { ...s.shipping, origin } }, user.id);
    await audit({ actor: user, action: "configuracion.origen", entity: "settings", entityId: "store", after: { postalCode: origin.postalCode } });
    return { ok: true, message: "Dirección de origen guardada." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "No se pudo guardar." };
  }
}

export async function runJobsAction(): Promise<ActionResult> {
  try {
    const user = await requirePermission("settings.manage");
    const r = await runJobs();
    await audit({ actor: user, action: "trabajos.ejecutados", entity: "settings", after: r });
    return { ok: true, message: `Conciliados ${r.reconciled}, vencidos ${r.expiredOrders}, guías ${r.labels.created}/${r.labels.failed} fallidas, correos ${r.notifications.sent}/${r.notifications.processed}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" };
  }
}

export async function retryEmailsAction(): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const r = await processNotifications({ limit: 100 });
    return { ok: true, message: `Procesados ${r.processed}, enviados ${r.sent}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" };
  }
}
