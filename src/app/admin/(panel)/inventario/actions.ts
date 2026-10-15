"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ActionResult } from "@/components/admin/ActionForm";
import { db } from "@/db";
import { inventoryComponents, variantComponents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ForbiddenError, requirePermission } from "@/lib/auth/guard";
import { adjustStock } from "@/lib/inventory/service";

function fail(err: unknown): ActionResult {
  if (err instanceof ForbiddenError) return { ok: false, message: err.message };
  if (err instanceof z.ZodError) return { ok: false, message: "Datos inválidos." };
  return { ok: false, message: err instanceof Error ? err.message : "No se pudo guardar." };
}

export async function adjustStockAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("inventory.manage");
    const componentId = z.string().min(2).max(60).parse(form.get("componentId"));
    const delta = z.coerce.number().int().min(-100000).max(100000).parse(form.get("delta"));
    const reason = z.enum(["ajuste", "devolucion", "correccion"]).parse(form.get("reason"));
    const note = z.string().trim().min(3, "Describe el motivo.").max(300).parse(form.get("note"));
    const updated = await db.transaction(async (tx) => {
      const r = await adjustStock(tx, { componentId, delta, reason, userId: user.id, note });
      await audit({ actor: user, action: "inventario.ajuste", entity: "inventory", entityId: componentId, after: { delta, reason, note, onHand: r.onHand } }, tx);
      return r;
    });
    revalidatePath("/admin/inventario");
    return { ok: true, message: `Existencias: ${updated.onHand}.` };
  } catch (err) {
    return fail(err);
  }
}

const optInt = z.preprocess((v) => (v === "" || v === null ? null : Number(v)), z.number().int().min(0).max(1_000_000).nullable());

export async function componentMetaAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("inventory.manage");
    const id = z.string().min(2).max(60).parse(form.get("componentId"));
    const data = {
      lowStockThreshold: z.coerce.number().int().min(0).max(100000).parse(form.get("lowStockThreshold")),
      weightGrams: optInt.parse(form.get("weightGrams")),
      lengthCm: optInt.parse(form.get("lengthCm")),
      widthCm: optInt.parse(form.get("widthCm")),
      heightCm: optInt.parse(form.get("heightCm")),
    };
    const [before] = await db.select().from(inventoryComponents).where(eq(inventoryComponents.id, id));
    await db.update(inventoryComponents).set(data).where(eq(inventoryComponents.id, id));
    await audit({ actor: user, action: "inventario.componente", entity: "inventory", entityId: id, before, after: data });
    revalidatePath("/admin/inventario");
    return { ok: true, message: "Guardado." };
  } catch (err) {
    return fail(err);
  }
}

/** Cambia cuántas unidades de un componente consume una variante (p. ej. 2×1 = 2 chips, kit = 12 chips). */
export async function mappingAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("inventory.manage");
    const variantId = z.string().min(3).max(120).parse(form.get("variantId"));
    const componentId = z.string().min(2).max(60).parse(form.get("componentId"));
    const quantity = z.coerce.number().int().min(0).max(1000).parse(form.get("quantity"));
    if (quantity === 0) {
      await db.delete(variantComponents).where(and(eq(variantComponents.variantId, variantId), eq(variantComponents.componentId, componentId)));
    } else {
      await db.insert(variantComponents).values({ variantId, componentId, quantity }).onConflictDoUpdate({ target: [variantComponents.variantId, variantComponents.componentId], set: { quantity } });
    }
    await audit({ actor: user, action: "inventario.mapa", entity: "inventory", entityId: variantId, after: { componentId, quantity } });
    revalidatePath("/admin/inventario");
    return { ok: true, message: "Mapa actualizado." };
  } catch (err) {
    return fail(err);
  }
}
