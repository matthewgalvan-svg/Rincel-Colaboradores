"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ActionResult } from "@/components/admin/ActionForm";
import { db } from "@/db";
import { supportRequests } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ForbiddenError, requirePermission } from "@/lib/auth/guard";

export async function updateSupportAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("support.manage");
    const id = z.uuid().parse(form.get("id"));
    const status = z.enum(["abierta", "en_revision", "resuelta", "rechazada"]).parse(form.get("status"));
    const resolution = z.string().trim().max(1000).parse(form.get("resolution") ?? "");
    const [before] = await db.select().from(supportRequests).where(eq(supportRequests.id, id));
    await db.update(supportRequests).set({ status, resolution: resolution || null, assignedTo: user.id }).where(eq(supportRequests.id, id));
    await audit({ actor: user, action: "solicitud.actualizada", entity: "support", entityId: id, before: { status: before?.status }, after: { status } });
    revalidatePath("/admin/solicitudes");
    return { ok: true, message: "Actualizada." };
  } catch (err) {
    return { ok: false, message: err instanceof ForbiddenError ? err.message : "Datos inválidos." };
  }
}
