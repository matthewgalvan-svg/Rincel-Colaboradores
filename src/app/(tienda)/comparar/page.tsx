import type { Metadata } from "next";
import Link from "next/link";
import { CompareTable } from "@/components/compare/CompareTable";
import { listPublicProducts } from "@/lib/catalog/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Comparar planes",
  description: "Compara precio, GB, vigencia y redes sociales de los planes Rincel: portabilidad, línea nueva y chips de solo datos.",
  alternates: { canonical: "/comparar" },
};

export default async function CompararPage() {
  const products = await listPublicProducts();
  const lines = products.filter((p) => p.category === "portabilidad" || p.category === "linea_nueva");
  const data = products.filter((p) => p.category === "datos");
  return (
    <div className="container-page pt-8">
      <h1 className="text-3xl sm:text-4xl">Comparar planes</h1>
      <p className="mt-2 max-w-2xl text-lg text-tinta-suave">Precio, gigas y vigencia lado a lado. Todos son pagos únicos, sin cobros automáticos.</p>

      <section className="mt-8" aria-labelledby="cmp-lineas">
        <h2 id="cmp-lineas" className="text-2xl">
          Planes con número
        </h2>
        <p className="mt-1 text-sm text-tinta-suave">Portabilidad: conservas tu número. Línea nueva: estrenas número.</p>
        <div className="mt-4">
          <CompareTable products={lines} caption="Comparación de planes de portabilidad y línea nueva" />
        </div>
        <p className="mt-3 text-xs text-tinta-suave">* Redes sociales ilimitadas sujetas a condiciones vigentes de Rincel. Los GB de portabilidad corresponden a la promoción de portabilidad. Requieren equipo liberado y compatible.</p>
      </section>

      <section className="mt-12" aria-labelledby="cmp-datos">
        <h2 id="cmp-datos" className="text-2xl">
          Chips de solo datos
        </h2>
        <p className="mt-1 text-sm text-tinta-suave">La bolsa de redes sociales es aparte y no se suma a los GB para navegar. No incluyen MiFi.</p>
        <div className="mt-4">
          <CompareTable products={data} caption="Comparación de chips de solo datos" />
        </div>
      </section>

      <p className="mt-10 text-center">
        <Link href="/planes/mifi" className="btn-secondary">
          ¿Necesitas compartir internet? Ver MiFi
        </Link>
      </p>
    </div>
  );
}
