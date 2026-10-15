import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { inventoryComponents, products, productVariants, variantComponents } from "@/db/schema";
import { commercialFactsHash } from "./facts";
import { SEED_COMPONENTS, SEED_PRODUCTS } from "./seed-data";

/**
 * Carga o actualiza el catálogo base. Es idempotente: no pisa precios ni
 * estados que el administrador ya haya cambiado (solo inserta lo que falte),
 * salvo con `overwrite: true`.
 */
export async function seedCatalog(tx: DbOrTx, opts: { overwrite?: boolean; initialStock?: number | null } = {}) {
  for (const c of SEED_COMPONENTS) {
    await tx
      .insert(inventoryComponents)
      .values({ id: c.id, name: c.name, notes: c.notes, onHand: opts.initialStock ?? 0 })
      .onConflictDoNothing();
  }
  for (const p of SEED_PRODUCTS) {
    const { variants, ...data } = p;
    const values = { ...data, imageFactsHash: commercialFactsHash(p), seoTitle: null };
    if (opts.overwrite) {
      await tx.insert(products).values(values).onConflictDoUpdate({ target: products.id, set: { ...values, updatedAt: new Date() } });
    } else {
      await tx.insert(products).values(values).onConflictDoNothing();
    }
    for (const [i, v] of variants.entries()) {
      const id = `${p.id}:${v.code}`;
      await tx
        .insert(productVariants)
        .values({ id, productId: p.id, code: v.code, label: v.label, simType: v.simType, delivery: v.delivery, sortOrder: i })
        .onConflictDoNothing();
      for (const c of v.components) {
        await tx.insert(variantComponents).values({ variantId: id, componentId: c.componentId, quantity: c.quantity }).onConflictDoNothing();
      }
    }
  }
  const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(products);
  return { products: count };
}
