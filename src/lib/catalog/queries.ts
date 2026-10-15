import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { products, productVariants } from "@/db/schema";
import type { DeliveryKind, ProductCategory, SimType } from "@/lib/domain/types";
import { variantAvailability } from "@/lib/inventory/service";
import { publicImage } from "./facts";

export interface PublicVariant {
  id: string;
  code: string;
  label: string;
  simType: SimType | null;
  delivery: DeliveryKind;
  /** null = sin límite físico (eSIM). */
  availableUnits: number | null;
}

/** Producto tal como se envía al navegador: sin pendientes internos ni notas. */
export interface PublicProduct {
  id: string;
  name: string;
  shortName: string;
  category: ProductCategory;
  priceCents: number;
  dataGb: number | null;
  validityDays: number | null;
  socialDataGb: number | null;
  socialUnlimited: boolean;
  linesPerUnit: number;
  tagline: string;
  description: string;
  features: string[];
  requirements: string[];
  conditions: string[];
  priceNote: string | null;
  ctaLabel: string;
  chargeable: boolean;
  image: { src: string; alt: string; commercial: boolean } | null;
  thumb: string | null;
  seoDescription: string | null;
  variants: PublicVariant[];
  inStock: boolean;
}

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;

export function toPublicProduct(p: ProductRow, variants: VariantRow[], availability: Map<string, number | null>): PublicProduct {
  const image = publicImage(p);
  const pv: PublicVariant[] = variants
    .filter((v) => v.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => ({
      id: v.id,
      code: v.code,
      label: v.label,
      simType: v.simType,
      delivery: v.delivery,
      availableUnits: availability.has(v.id) ? availability.get(v.id)! : null,
    }));
  return {
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    category: p.category,
    priceCents: p.priceCents,
    dataGb: p.dataGb,
    validityDays: p.validityDays,
    socialDataGb: p.socialDataGb,
    socialUnlimited: p.socialUnlimited,
    linesPerUnit: p.linesPerUnit,
    tagline: p.tagline,
    description: p.description,
    features: p.features,
    requirements: p.requirements,
    conditions: p.conditions,
    priceNote: p.priceNote,
    ctaLabel: p.ctaLabel,
    chargeable: p.chargeable,
    image,
    thumb: image ? image.src.replace(/\.webp$/, "-480.webp") : null,
    seoDescription: p.seoDescription,
    variants: pv,
    inStock: pv.some((v) => v.availableUnits === null || v.availableUnits > 0),
  };
}

export async function listPublicProducts(tx: DbOrTx = db): Promise<PublicProduct[]> {
  const [rows, variants, availability] = await Promise.all([
    tx.select().from(products).where(eq(products.status, "active")).orderBy(asc(products.sortOrder)),
    tx.select().from(productVariants),
    variantAvailability(tx),
  ]);
  return rows.map((p) =>
    toPublicProduct(
      p,
      variants.filter((v) => v.productId === p.id),
      availability,
    ),
  );
}

export async function getPublicProduct(id: string, tx: DbOrTx = db): Promise<PublicProduct | null> {
  const [p] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p || p.status !== "active") return null;
  const [variants, availability] = await Promise.all([tx.select().from(productVariants).where(eq(productVariants.productId, id)), variantAvailability(tx)]);
  return toPublicProduct(p, variants, availability);
}
