import { sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryComponents } from "@/db/schema";
import { seedCatalog } from "@/lib/catalog/seed";
import { resetEnvCache } from "@/lib/env";
import { setGatewayOverride } from "@/lib/payments";

/** Deja la base en estado conocido: catálogo base, existencias dadas y sin pedidos. */
export async function resetDatabase(stock = 50) {
  setGatewayOverride(null);
  resetEnvCache();
  await db.execute(sql`truncate table
    analytics_events, audit_log, notifications, receipts, files, activations, shipment_events, shipments,
    shipping_quotes, refunds, webhook_events, payments, inventory_reservations, inventory_movements,
    order_events, order_items, orders, support_requests, simulated_provider_orders, settings, rate_limits,
    variant_components, product_variants, products, inventory_components restart identity cascade`);
  await seedCatalog(db, { initialStock: stock, overwrite: true });
  await db.update(inventoryComponents).set({ onHand: stock });
}
