import type { MetadataRoute } from "next";
import { listPublicProducts } from "@/lib/catalog/queries";
import { POLICIES } from "@/content/politicas";

export const dynamic = "force-dynamic";

/** Solo páginas públicas e indexables (sin checkout, pedidos ni administración). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const products = await listPublicProducts().catch(() => []);
  const now = new Date();
  const staticPaths = ["/", "/planes", "/planes/portabilidad", "/planes/linea-nueva", "/planes/chips-datos", "/planes/mifi", "/planes/kit-colaborador", "/comparar", "/vende-rincel", "/preguntas-frecuentes", "/contacto", "/seguimiento"];
  return [
    ...staticPaths.map((p) => ({ url: `${base}${p}`, lastModified: now, changeFrequency: "weekly" as const, priority: p === "/" ? 1 : 0.7 })),
    ...products.map((p) => ({ url: `${base}/producto/${p.id}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...POLICIES.map((p) => ({ url: `${base}/politicas/${p.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
