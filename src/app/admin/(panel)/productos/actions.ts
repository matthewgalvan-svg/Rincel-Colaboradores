"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/admin/ActionForm";
import { OpError } from "@/lib/admin/order-ops";
import { approveCurrentImage, createDraftProduct, parseProductForm, replaceProductImage, saveProduct, setVariantActive } from "@/lib/admin/product-ops";
import { ForbiddenError, requirePermission } from "@/lib/auth/guard";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";

function fail(err: unknown): ActionResult {
  if (err instanceof OpError || err instanceof ForbiddenError) return { ok: false, message: err.message };
  if (err instanceof z.ZodError) return { ok: false, message: `Revisa: ${err.issues.map((i) => i.path.join(".")).join(", ")}` };
  console.error("product_action_error", err instanceof Error ? err.message : err);
  return { ok: false, message: "No se pudo guardar." };
}

function refresh(id?: string) {
  revalidatePath("/admin/productos");
  if (id) revalidatePath(`/admin/productos/${id}`);
  revalidatePath("/", "layout");
}

export async function saveProductAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("products.manage");
    const id = z.string().min(1).max(80).parse(form.get("id"));
    const r = await saveProduct(id, parseProductForm(form), user);
    refresh(id);
    return { ok: true, message: r.imageOutdated ? "Guardado. El precio o beneficios ya no coinciden con el cartel: la imagen comercial se ocultó hasta reemplazarla o aprobarla." : "Guardado." };
  } catch (err) {
    return fail(err);
  }
}

export async function replaceImageAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("products.manage");
    const id = z.string().min(1).max(80).parse(form.get("id"));
    if (form.get("confirm") !== "1") throw new OpError("Confirma que la imagen muestra el precio y beneficios vigentes.");
    const f = form.get("image");
    if (!(f instanceof File) || !f.size) throw new OpError("Selecciona una imagen.");
    if (f.size > MAX_UPLOAD_BYTES) throw new OpError("La imagen excede 8 MB.");
    await replaceProductImage(id, { data: Buffer.from(await f.arrayBuffer()), filename: f.name }, user);
    refresh(id);
    return { ok: true, message: "Imagen reemplazada y publicada." };
  } catch (err) {
    return fail(err);
  }
}

export async function approveImageAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("products.manage");
    const id = z.string().min(1).max(80).parse(form.get("id"));
    if (form.get("confirm") !== "1") throw new OpError("Confirma que verificaste el cartel contra los datos vigentes.");
    await approveCurrentImage(id, user);
    refresh(id);
    return { ok: true, message: "Imagen aprobada para los datos actuales." };
  } catch (err) {
    return fail(err);
  }
}

export async function variantAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("products.manage");
    const variantId = z.string().min(3).max(120).parse(form.get("variantId"));
    await setVariantActive(variantId, form.get("active") === "1", user);
    refresh(variantId.split(":")[0]);
    return { ok: true, message: "Variante actualizada." };
  } catch (err) {
    return fail(err);
  }
}

export async function createDraftAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("products.manage");
    const input = z
      .object({
        id: z.string().trim().min(3).max(60),
        name: z.string().trim().min(3).max(120),
        category: z.enum(["portabilidad", "linea_nueva", "datos", "equipo", "kit"]),
        price: z.coerce.number().min(1).max(100000),
        delivery: z.enum(["physical", "digital"]),
        componentId: z.string().max(60).optional(),
        componentQty: z.coerce.number().int().min(1).max(100).default(1),
      })
      .parse(Object.fromEntries(form));
    await createDraftProduct({ id: input.id, name: input.name, category: input.category, priceCents: Math.round(input.price * 100), delivery: input.delivery, componentId: input.componentId || null, componentQty: input.componentQty }, user);
    refresh();
    return { ok: true, message: "Borrador creado. Complétalo antes de publicarlo." };
  } catch (err) {
    return fail(err);
  }
}
