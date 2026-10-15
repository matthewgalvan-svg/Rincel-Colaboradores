import type { Metadata } from "next";
import { listPublicProducts } from "@/lib/catalog/queries";
import { CATEGORY_TABS, CatalogView } from "./catalog-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Planes y productos",
  description: "Planes Rincel con portabilidad, líneas nuevas, chips de solo datos, MiFi y kit colaborador. Precios en MXN.",
  alternates: { canonical: "/planes" },
};

export default async function PlanesPage() {
  const products = await listPublicProducts();
  return <CatalogView products={products} active={CATEGORY_TABS[0]} />;
}
