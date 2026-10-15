import "server-only";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/db";
import { products, productVariants, variantComponents } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/guard";
import { commercialFactsHash } from "@/lib/catalog/facts";
import { saveFile } from "@/lib/storage";
import { OpError } from "./order-ops";

type Actor = Pick<StaffUser, "id" | "email" | "role">;

const lines = (v: unknown) =>
  String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

const optionalNumber = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(0).max(100000).nullable());

export const productFormSchema = z.object({
  name: z.string().trim().min(3).max(120),
  shortName: z.string().trim().min(2).max(60),
  status: z.enum(["draft", "active", "hidden", "archived"]),
  chargeable: z.boolean(),
  priceCents: z.number().int().min(100).max(10_000_000),
  dataGb: optionalNumber,
  validityDays: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(1).max(365).nullable()),
  socialDataGb: optionalNumber,
  socialUnlimited: z.boolean(),
  tagline: z.string().trim().max(160),
  description: z.string().trim().max(1500),
  features: z.array(z.string().max(200)),
  requirements: z.array(z.string().max(200)),
  conditions: z.array(z.string().max(300)),
  priceNote: z.string().trim().max(200).nullable(),
  ctaLabel: z.string().trim().min(3).max(40),
  internalPending: z.array(z.string().max(300)),
  imageAlt: z.string().trim().max(300),
  seoDescription: z.string().trim().max(300).nullable(),
});

export function parseProductForm(form: FormData) {
  const price = String(form.get("price") ?? "").replace(/[$,\s]/g, "");
  return productFormSchema.parse({
    name: form.get("name"),
    shortName: form.get("shortName"),
    status: form.get("status"),
    chargeable: form.get("chargeable") === "1",
    priceCents: Math.round(Number(price) * 100),
    dataGb: form.get("dataGb"),
    validityDays: form.get("validityDays"),
    socialDataGb: form.get("socialDataGb"),
    socialUnlimited: form.get("socialUnlimited") === "1",
    tagline: form.get("tagline") ?? "",
    description: form.get("description") ?? "",
    features: lines(form.get("features")),
    requirements: lines(form.get("requirements")),
    conditions: lines(form.get("conditions")),
    priceNote: String(form.get("priceNote") ?? "").trim() || null,
    ctaLabel: form.get("ctaLabel"),
    internalPending: lines(form.get("internalPending")),
    imageAlt: form.get("imageAlt") ?? "",
    seoDescription: String(form.get("seoDescription") ?? "").trim() || null,
  });
}

/**
 * Guarda cambios de producto. Si cambia el precio o un beneficio impreso en
 * el cartel, la huella deja de coincidir y la imagen comercial se oculta
 * automáticamente hasta que se reemplace o se apruebe de nuevo.
 */
export async function saveProduct(id: string, data: z.infer<typeof productFormSchema>, actor: Actor) {
  const [before] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!before) throw new OpError("Producto inexistente.");
  if (data.status === "active" && data.chargeable && data.priceCents <= 0) throw new OpError("Precio inválido.");
  const [after] = await db
    .update(products)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  const factsChanged = commercialFactsHash(before) !== commercialFactsHash(after);
  await audit({ actor, action: "producto.editado", entity: "product", entityId: id, before: pick(before), after: pick(after) });
  return { factsChanged, imageOutdated: Boolean(after.imagePath) && after.imageFactsHash !== commercialFactsHash(after) };
}

function pick(p: typeof products.$inferSelect) {
  return { name: p.name, status: p.status, chargeable: p.chargeable, priceCents: p.priceCents, dataGb: p.dataGb, validityDays: p.validityDays, socialDataGb: p.socialDataGb, socialUnlimited: p.socialUnlimited, priceNote: p.priceNote };
}

/** Reemplaza la imagen comercial (se optimiza a WebP, se conserva la proporción). */
export async function replaceProductImage(id: string, file: { data: Buffer; filename: string }, actor: Actor) {
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p) throw new OpError("Producto inexistente.");
  let webp: Buffer;
  try {
    webp = await sharp(file.data).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw new OpError("No se pudo procesar la imagen (usa PNG, JPG o WebP).");
  }
  const saved = await saveFile({ kind: "producto", data: webp, filename: file.filename.replace(/\.\w+$/, ".webp"), mimeType: "image/webp", uploadedBy: actor.id, isPrivate: false });
  await db
    .update(products)
    .set({ imagePath: `/media/${saved.id}`, imageFactsHash: commercialFactsHash(p), imageReviewRequired: false, updatedAt: new Date() })
    .where(eq(products.id, id));
  await audit({ actor, action: "producto.imagen_reemplazada", entity: "product", entityId: id, before: { imagePath: p.imagePath }, after: { imagePath: `/media/${saved.id}` } });
}

/** El administrador confirma que el cartel actual coincide con el precio y beneficios vigentes. */
export async function approveCurrentImage(id: string, actor: Actor) {
  if (actor.role !== "admin") throw new OpError("Solo un administrador puede aprobar imágenes.");
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p?.imagePath) throw new OpError("El producto no tiene imagen comercial.");
  await db.update(products).set({ imageFactsHash: commercialFactsHash(p), imageReviewRequired: false }).where(eq(products.id, id));
  await audit({ actor, action: "producto.imagen_aprobada", entity: "product", entityId: id, after: { facts: pick(p) } });
}

export async function setVariantActive(variantId: string, active: boolean, actor: Actor) {
  const [v] = await db.update(productVariants).set({ active }).where(eq(productVariants.id, variantId)).returning();
  if (!v) throw new OpError("Variante inexistente.");
  await audit({ actor, action: active ? "variante.activada" : "variante.desactivada", entity: "product", entityId: v.productId, after: { variantId } });
}

/** Crea un producto en borrador (no se publica ni se cobra hasta completarlo). */
export async function createDraftProduct(input: { id: string; name: string; category: "portabilidad" | "linea_nueva" | "datos" | "equipo" | "kit"; priceCents: number; delivery: "physical" | "digital"; componentId: string | null; componentQty: number }, actor: Actor) {
  if (!/^[a-z0-9-]{3,60}$/.test(input.id)) throw new OpError("El identificador solo admite minúsculas, números y guiones.");
  const [exists] = await db.select({ id: products.id }).from(products).where(eq(products.id, input.id));
  if (exists) throw new OpError("Ya existe un producto con ese identificador.");
  await db.transaction(async (tx) => {
    await tx.insert(products).values({
      id: input.id,
      name: input.name,
      shortName: input.name.slice(0, 60),
      category: input.category,
      status: "draft",
      chargeable: false,
      priceCents: input.priceCents,
      linesPerUnit: ["portabilidad", "linea_nueva", "datos"].includes(input.category) ? 1 : 0,
      ctaLabel: "Elegir este plan",
      internalPending: ["Completar descripción, beneficios, condiciones e imagen antes de publicar."],
      sortOrder: 500,
    });
    const variantId = `${input.id}:${input.delivery === "digital" ? "esim" : "fisico"}`;
    await tx.insert(productVariants).values({ id: variantId, productId: input.id, code: input.delivery === "digital" ? "esim" : "fisico", label: input.delivery === "digital" ? "eSIM (entrega digital)" : "Chip físico", simType: input.delivery === "digital" ? "esim" : "fisico", delivery: input.delivery });
    if (input.componentId && input.delivery === "physical") {
      await tx.insert(variantComponents).values({ variantId, componentId: input.componentId, quantity: Math.max(1, input.componentQty) });
    }
    await audit({ actor, action: "producto.creado_borrador", entity: "product", entityId: input.id, after: input }, tx);
  });
}
