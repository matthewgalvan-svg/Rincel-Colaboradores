import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPublicProducts } from "@/lib/catalog/queries";
import { CATEGORY_TABS, CatalogView } from "../catalog-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ categoria: string }> }): Promise<Metadata> {
  const { categoria } = await params;
  const tab = CATEGORY_TABS.find((t) => t.slug === categoria && t.slug);
  if (!tab) return {};
  return { title: tab.label, description: tab.intro, alternates: { canonical: `/planes/${tab.slug}` } };
}

export default async function CategoriaPage({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  const tab = CATEGORY_TABS.find((t) => t.slug === categoria && t.slug);
  if (!tab) notFound();
  const products = await listPublicProducts();
  return <CatalogView products={products} active={tab} />;
}
