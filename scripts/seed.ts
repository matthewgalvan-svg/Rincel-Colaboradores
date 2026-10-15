/**
 * Carga el catálogo base (13 productos) y componentes de inventario.
 *
 *   npm run db:seed                 → inventario en 0 (producción: capturar existencias reales)
 *   npm run db:seed -- --dev-stock  → existencias de PRUEBA (solo desarrollo)
 */
import { closeDb, db } from "@/db";
import { seedCatalog } from "@/lib/catalog/seed";

async function main() {
  const devStock = process.argv.includes("--dev-stock");
  if (devStock && process.env.APP_ENV === "production") throw new Error("No se permiten existencias de prueba en producción.");
  const r = await db.transaction((tx) => seedCatalog(tx, { initialStock: devStock ? 100 : 0, overwrite: process.argv.includes("--overwrite") }));
  console.log(`Catálogo listo: ${r.products} productos.${devStock ? " Existencias de prueba: 100 por componente." : " Existencias en 0: captúralas en el panel."}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});
