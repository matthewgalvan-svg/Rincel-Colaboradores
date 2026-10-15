import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import type { PublicProduct } from "@/lib/catalog/queries";
import type { ProductCategory } from "@/lib/domain/types";

export const CATEGORY_TABS: { slug: string; category: ProductCategory | null; label: string; intro: string }[] = [
  { slug: "", category: null, label: "Todos", intro: "Planes con portabilidad, líneas nuevas, chips de solo datos, internet portátil y el kit para vender Rincel." },
  { slug: "portabilidad", category: "portabilidad", label: "Portabilidad", intro: "Cámbiate a Rincel conservando tu número. Incluye la promoción 2×1: dos líneas por $230 en el primer pago." },
  { slug: "linea-nueva", category: "linea_nueva", label: "Línea nueva", intro: "Estrena número con Rincel. 30 días de vigencia y redes sociales ilimitadas sujetas a condiciones." },
  { slug: "chips-datos", category: "datos", label: "Chips de datos", intro: "Chips Rincel de solo datos: GB para navegar más una bolsa aparte para redes sociales. No incluyen MiFi." },
  { slug: "mifi", category: "equipo", label: "MiFi", intro: "Internet portátil 4G LTE para compartir por Wi-Fi. Servicio prepago por recargas, sujeto a cobertura." },
  { slug: "kit-colaborador", category: "kit", label: "Kit colaborador", intro: "Todo lo necesario para empezar a vender Rincel: 12 chips, volantes y soporte para activar líneas." },
];

export function CatalogView({ products, active }: { products: PublicProduct[]; active: (typeof CATEGORY_TABS)[number] }) {
  const list = active.category ? products.filter((p) => p.category === active.category) : products;
  return (
    <div className="container-page pt-8">
      <h1 className="text-3xl sm:text-4xl">{active.category ? active.label : "Planes y productos"}</h1>
      <p className="mt-2 max-w-2xl text-lg text-tinta-suave">{active.intro}</p>
      <nav aria-label="Categorías" className="-mx-4 mt-6 overflow-x-auto px-4">
        <ul className="flex w-max gap-2 pb-2">
          {CATEGORY_TABS.map((t) => {
            const href = t.slug ? `/planes/${t.slug}` : "/planes";
            const current = t.slug === active.slug;
            return (
              <li key={t.slug || "todos"}>
                <Link href={href} aria-current={current ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-extrabold ${current ? "border-marino bg-marino text-white" : "border-borde bg-white text-marino hover:border-morado"}`}>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {active.category === "datos" ? (
        <p className="mt-4 rounded-xl bg-celeste-50 px-4 py-3 text-sm font-semibold text-marino">
          La bolsa de redes sociales es independiente: no se suma a los GB de navegación. Estos chips no son ilimitados y no incluyen MiFi.
        </p>
      ) : null}
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <ProductCard key={p.id} product={p} headingLevel="h2" />
        ))}
      </div>
      {!list.length ? <p className="mt-8 text-tinta-suave">No hay productos disponibles en esta categoría por ahora.</p> : null}
      <p className="mt-10 text-center">
        <Link href="/comparar" className="btn-secondary">
          Comparar planes
        </Link>
      </p>
    </div>
  );
}
