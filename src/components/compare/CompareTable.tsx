import Link from "next/link";
import type { PublicProduct } from "@/lib/catalog/queries";
import { formatMXN } from "@/lib/money";

function gbText(p: PublicProduct) {
  if (p.linesPerUnit === 2) return "Ver condiciones";
  return p.dataGb !== null ? `${p.dataGb} GB` : "—";
}

function socialText(p: PublicProduct) {
  if (p.category === "datos") return p.socialDataGb !== null ? `Bolsa aparte de ${p.socialDataGb} GB` : "—";
  if (p.socialUnlimited) return "Ilimitadas*";
  return "Ver condiciones";
}

function numberText(p: PublicProduct) {
  if (p.category === "portabilidad") return p.linesPerUnit === 2 ? "Conservas ambos" : "Conservas el tuyo";
  if (p.category === "linea_nueva") return "Número nuevo";
  return "Solo datos";
}

/** Comparador legible: tabla en pantallas medianas y tarjetas en móvil. */
export function CompareTable({ products, caption }: { products: PublicProduct[]; caption: string }) {
  return (
    <div>
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-borde/70 bg-white md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-celeste text-marino">
            <tr>
              <th scope="col" className="px-4 py-3 font-extrabold">Plan</th>
              <th scope="col" className="px-4 py-3 font-extrabold">Precio</th>
              <th scope="col" className="px-4 py-3 font-extrabold">Para navegar</th>
              <th scope="col" className="px-4 py-3 font-extrabold">Vigencia</th>
              <th scope="col" className="px-4 py-3 font-extrabold">Redes sociales</th>
              <th scope="col" className="px-4 py-3 font-extrabold">Número</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde/60">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-celeste-50/60">
                <th scope="row" className="px-4 py-3 font-extrabold text-marino">
                  {p.name}
                  {p.priceNote ? <span className="mt-0.5 block text-xs font-semibold text-tinta-suave">{p.priceNote}</span> : null}
                </th>
                <td className="px-4 py-3 font-display text-xl font-extrabold whitespace-nowrap text-marino">
                  {formatMXN(p.priceCents)}
                  {p.linesPerUnit === 2 ? <span className="block font-sans text-xs font-semibold text-tinta-suave">por 2 líneas</span> : null}
                </td>
                <td className="px-4 py-3 font-bold">{gbText(p)}</td>
                <td className="px-4 py-3">{p.validityDays ? `${p.validityDays} días` : "Ver condiciones"}</td>
                <td className="px-4 py-3">{socialText(p)}</td>
                <td className="px-4 py-3">{numberText(p)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/producto/${p.id}`} className="btn-primary min-h-10 px-4 text-sm whitespace-nowrap">
                    Elegir este plan
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-3 md:hidden" aria-label={caption}>
        {products.map((p) => (
          <li key={p.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-extrabold text-marino">{p.name}</p>
                <p className="text-sm text-tinta-suave">{numberText(p)}</p>
              </div>
              <p className="text-right font-display text-2xl leading-none font-extrabold text-marino">
                {formatMXN(p.priceCents)}
                {p.linesPerUnit === 2 ? <span className="block font-sans text-xs font-semibold text-tinta-suave">por 2 líneas</span> : null}
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-celeste-50 p-2">
                <dt className="text-tinta-suave">Navegar</dt>
                <dd className="font-extrabold text-marino">{gbText(p)}</dd>
              </div>
              <div className="rounded-lg bg-celeste-50 p-2">
                <dt className="text-tinta-suave">Vigencia</dt>
                <dd className="font-extrabold text-marino">{p.validityDays ? `${p.validityDays} días` : "Ver cond."}</dd>
              </div>
              <div className="rounded-lg bg-celeste-50 p-2">
                <dt className="text-tinta-suave">Redes</dt>
                <dd className="font-extrabold text-marino">{socialText(p)}</dd>
              </div>
            </dl>
            {p.priceNote ? <p className="mt-2 text-xs font-semibold text-tinta-suave">{p.priceNote}</p> : null}
            <Link href={`/producto/${p.id}`} className="btn-primary mt-3 min-h-11 w-full text-sm">
              Elegir este plan
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
