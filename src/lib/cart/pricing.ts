import "server-only";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { products, productVariants, variantComponents } from "@/db/schema";
import type { DeliveryKind, OrderItemSnapshot } from "@/lib/domain/types";
import { variantAvailability } from "@/lib/inventory/service";
import { sha256Hex } from "@/lib/security/tokens";

export const cartLineInputSchema = z.object({
  productId: z.string().min(1).max(80),
  variantCode: z.string().min(1).max(20),
  quantity: z.number().int().min(1).max(50),
});
export const cartInputSchema = z.array(cartLineInputSchema).min(1, "Tu carrito está vacío.").max(20);
export type CartLineInput = z.infer<typeof cartLineInputSchema>;

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;

export interface PricedLine {
  product: ProductRow;
  variant: VariantRow;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  delivery: DeliveryKind;
}

export interface CartIssue {
  productId: string;
  variantCode?: string;
  code: "not_found" | "unavailable" | "not_chargeable" | "variant_unavailable" | "quantity_limit" | "out_of_stock";
  message: string;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotalCents: number;
  requiresShipping: boolean;
  hasDigital: boolean;
  /** Componentes físicos que viajan en el envío. */
  physicalComponents: { componentId: string; quantity: number }[];
  /** Huella de los artículos físicos: liga una cotización de envío a este carrito. */
  shippingCartHash: string;
  issues: CartIssue[];
}

/**
 * Valora el carrito con precios y disponibilidad del servidor. Los importes
 * que envía el navegador se ignoran: aquí se recalcula todo.
 */
export async function priceCart(tx: DbOrTx, input: CartLineInput[], opts: { maxQuantityPerItem: number }): Promise<PricedCart> {
  // Une líneas repetidas del mismo producto/variante.
  const merged = new Map<string, CartLineInput>();
  for (const l of input) {
    const key = `${l.productId}:${l.variantCode}`;
    const prev = merged.get(key);
    merged.set(key, { ...l, quantity: (prev?.quantity ?? 0) + l.quantity });
  }
  const lines = [...merged.values()];
  const ids = [...new Set(lines.map((l) => l.productId))];
  const [prodRows, varRows, availability] = await Promise.all([
    tx.select().from(products).where(inArray(products.id, ids)),
    tx.select().from(productVariants).where(inArray(productVariants.productId, ids)),
    variantAvailability(tx),
  ]);
  const issues: CartIssue[] = [];
  const priced: PricedLine[] = [];
  for (const l of lines) {
    const p = prodRows.find((x) => x.id === l.productId);
    if (!p) {
      issues.push({ productId: l.productId, code: "not_found", message: "Este producto ya no existe." });
      continue;
    }
    if (p.status !== "active") {
      issues.push({ productId: p.id, code: "unavailable", message: `${p.name} no está disponible por ahora.` });
      continue;
    }
    if (!p.chargeable) {
      issues.push({ productId: p.id, code: "not_chargeable", message: `${p.name} aún no puede comprarse en línea.` });
      continue;
    }
    const v = varRows.find((x) => x.productId === p.id && x.code === l.variantCode && x.active);
    if (!v) {
      issues.push({ productId: p.id, variantCode: l.variantCode, code: "variant_unavailable", message: `La modalidad elegida de ${p.name} no está disponible.` });
      continue;
    }
    if (l.quantity > opts.maxQuantityPerItem) {
      issues.push({ productId: p.id, variantCode: v.code, code: "quantity_limit", message: `Puedes comprar hasta ${opts.maxQuantityPerItem} de ${p.name} por pedido.` });
      continue;
    }
    const units = availability.has(v.id) ? availability.get(v.id)! : null;
    if (units !== null && units < l.quantity) {
      issues.push({
        productId: p.id,
        variantCode: v.code,
        code: "out_of_stock",
        message: units > 0 ? `Solo quedan ${units} disponibles de ${p.name} (${v.label}).` : `${p.name} (${v.label}) está agotado por ahora.`,
      });
      continue;
    }
    priced.push({ product: p, variant: v, quantity: l.quantity, unitPriceCents: p.priceCents, lineTotalCents: p.priceCents * l.quantity, delivery: v.delivery });
  }

  const physical = priced.filter((l) => l.delivery === "physical");
  const comps = physical.length
    ? await tx
        .select()
        .from(variantComponents)
        .where(
          inArray(
            variantComponents.variantId,
            physical.map((l) => l.variant.id),
          ),
        )
    : [];
  const compTotals = new Map<string, number>();
  for (const l of physical) {
    for (const c of comps.filter((x) => x.variantId === l.variant.id)) compTotals.set(c.componentId, (compTotals.get(c.componentId) ?? 0) + c.quantity * l.quantity);
  }
  const hashBase = physical
    .map((l) => `${l.variant.id}:${l.quantity}`)
    .sort()
    .join("|");

  return {
    lines: priced,
    subtotalCents: priced.reduce((s, l) => s + l.lineTotalCents, 0),
    requiresShipping: physical.length > 0,
    hasDigital: priced.some((l) => l.delivery === "digital"),
    physicalComponents: [...compTotals.entries()].map(([componentId, quantity]) => ({ componentId, quantity })),
    shippingCartHash: sha256Hex(hashBase || "sin-fisicos").slice(0, 32),
    issues,
  };
}

export function snapshotFor(line: PricedLine, capturedAt: Date): OrderItemSnapshot {
  const p = line.product;
  return {
    productId: p.id,
    name: p.name,
    category: p.category,
    variantCode: line.variant.code,
    variantLabel: line.variant.label,
    priceCents: p.priceCents,
    dataGb: p.dataGb,
    validityDays: p.validityDays,
    socialDataGb: p.socialDataGb,
    socialUnlimited: p.socialUnlimited,
    linesPerUnit: p.linesPerUnit,
    features: p.features,
    requirements: p.requirements,
    conditions: p.conditions,
    priceNote: p.priceNote,
    capturedAt: capturedAt.toISOString(),
  };
}
