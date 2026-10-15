import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyPanel } from "@/components/product/BuyPanel";
import { PriceTag, ProductCard } from "@/components/product/ProductCard";
import { ProductGallery } from "@/components/product/ProductGallery";
import { FaqList } from "@/components/ui/Faq";
import { Icon } from "@/components/ui/Icon";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { faqFor } from "@/content/faq";
import { categoryPath, keyFacts } from "@/lib/catalog/format";
import { getPublicProduct, listPublicProducts, type PublicProduct } from "@/lib/catalog/queries";
import { CATEGORY_LABELS } from "@/lib/domain/types";
import { getSettings, publicContact } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getPublicProduct(id);
  if (!p) return { title: "Producto no encontrado" };
  return {
    title: p.name,
    description: p.seoDescription ?? p.description,
    alternates: { canonical: `/producto/${p.id}` },
    openGraph: { title: p.name, description: p.seoDescription ?? p.description, images: p.image ? [{ url: p.image.src, width: 1254, height: 1254, alt: p.image.alt }] : [] },
  };
}

/** Recomendaciones pertinentes (no "más vendidos" sin datos). */
function recommendations(p: PublicProduct, all: PublicProduct[]) {
  const others = all.filter((x) => x.id !== p.id);
  const pick = (ids: string[]) => ids.map((id) => others.find((o) => o.id === id)).filter((x): x is PublicProduct => Boolean(x));
  switch (p.category) {
    case "portabilidad":
      return p.linesPerUnit === 2 ? pick(["rino-230-portabilidad", "rino-300-portabilidad", "rino-150-portabilidad"]) : pick(["rino-230-portabilidad-2x1", ...others.filter((o) => o.category === "portabilidad" && o.linesPerUnit === 1).map((o) => o.id)]).slice(0, 3);
    case "linea_nueva":
      return others.filter((o) => o.category === "linea_nueva").concat(pick(["rino-230-portabilidad-2x1"])).slice(0, 3);
    case "datos":
      return pick(["mifi-rincel"]).concat(others.filter((o) => o.category === "datos")).slice(0, 3);
    case "equipo":
      return others.filter((o) => o.category === "datos").slice(0, 3);
    case "kit":
      return pick(["rino-230-portabilidad-2x1", "rino-230-linea-nueva", "chip-datos-10gb-30dias"]);
  }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, all, settings] = await Promise.all([getPublicProduct(id), listPublicProducts(), getSettings()]);
  if (!product) notFound();
  const contact = publicContact(settings);
  const facts = keyFacts(product);
  const recs = recommendations(product, all);
  const isLine = ["portabilidad", "linea_nueva", "datos"].includes(product.category);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.id,
    brand: { "@type": "Brand", name: "Rincel" },
    ...(product.image ? { image: `${appUrl}${product.image.src}` } : {}),
    offers: {
      "@type": "Offer",
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: "MXN",
      availability: product.inStock && product.chargeable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${appUrl}/producto/${product.id}`,
      seller: { "@type": "Organization", name: settings.sellerName },
    },
  };

  return (
    <div className="pb-28 lg:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Ruta" className="container-page pt-5 text-sm text-tinta-suave">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/" className="hover:text-morado">Inicio</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href={categoryPath(product.category)} className="hover:text-morado">{CATEGORY_LABELS[product.category]}</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-bold text-marino">{product.shortName}</li>
        </ol>
      </nav>

      <section className="container-page grid gap-8 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="lg:sticky lg:top-20 lg:self-start">
          {product.image ? (
            <ProductGallery src={product.image.src} alt={product.image.alt} name={product.name} />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-[1.25rem] bg-celeste-50 font-display text-5xl font-extrabold text-morado">{product.shortName}</div>
          )}
          {product.image && !product.image.commercial ? <p className="mt-2 text-xs text-tinta-suave">Imagen ilustrativa del equipo.</p> : null}
        </div>

        <div>
          <p className="chip">{CATEGORY_LABELS[product.category]}</p>
          <h1 className="mt-3 text-3xl leading-tight sm:text-4xl">{product.name}</h1>
          <p className="mt-2 text-lg font-semibold text-tinta-suave">{product.tagline}</p>

          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl bg-celeste-50 px-2 py-3">
                <dt className="sr-only">{f.label}</dt>
                <dd>
                  <span className="block font-display text-2xl leading-none font-extrabold text-morado sm:text-3xl">{f.value}</span>
                  <span className="mt-1 block text-xs font-semibold text-tinta-suave">{f.label}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6">
            <PriceTag cents={product.priceCents} size="xl" suffix={product.linesPerUnit === 2 ? "por las 2 líneas" : undefined} />
            {product.validityDays ? <p className="mt-1 text-sm font-semibold text-tinta-suave">Pago único · {product.validityDays} días de vigencia · sin cobros automáticos</p> : <p className="mt-1 text-sm font-semibold text-tinta-suave">Pago único · sin cobros automáticos</p>}
          </div>

          <div className="mt-6">
            <BuyPanel productId={product.id} name={product.name} priceCents={product.priceCents} priceNote={product.priceNote} ctaLabel={product.ctaLabel} variants={product.variants} chargeable={product.chargeable} unitLabel={product.linesPerUnit === 2 ? "paquetes de 2 líneas" : undefined} />
          </div>

          {isLine ? (
            <p className="mt-5 flex gap-2 rounded-xl border border-borde bg-white p-4 text-sm text-tinta-suave">
              <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-azul" />
              <span>
                Comprar no activa la línea ni completa la portabilidad automáticamente. Después del pago te acompañamos en la activación. <strong className="text-marino">Nunca te pediremos tu NIP en el carrito.</strong>
              </span>
            </p>
          ) : null}

          <p className="mt-4 text-sm">
            <TrackedLink href={contact.whatsappUrl ?? "/contacto"} external={Boolean(contact.whatsappUrl)} ctaId="producto-duda" productId={product.id} className="link">
              Resolver una duda
            </TrackedLink>
            <span className="text-tinta-suave"> · </span>
            <TrackedLink href="/comparar" ctaId="producto-comparar" className="link">
              Comparar planes
            </TrackedLink>
          </p>
        </div>
      </section>

      <section className="container-page mt-14 grid gap-6 md:grid-cols-3">
        <div className="card p-6">
          <h2 className="text-xl">Qué incluye</h2>
          <ul className="mt-4 space-y-2.5">
            {product.features.map((f) => (
              <li key={f} className="flex gap-2.5">
                <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-exito" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-tinta-suave">{product.description}</p>
        </div>
        <div className="card p-6">
          <h2 className="text-xl">Requisitos</h2>
          {product.requirements.length ? (
            <ul className="mt-4 space-y-2.5">
              {product.requirements.map((r) => (
                <li key={r} className="flex gap-2.5">
                  <Icon name="phone" className="mt-0.5 h-5 w-5 shrink-0 text-azul" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-tinta-suave">Sin requisitos especiales.</p>
          )}
        </div>
        <div className="card p-6">
          <h2 className="text-xl">Condiciones</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-tinta-suave">
            {product.conditions.map((c) => (
              <li key={c} className="flex gap-2.5">
                <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-morado" />
                <span>{c}</span>
              </li>
            ))}
            <li className="flex gap-2.5">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-morado" />
              <span>Aplican condiciones vigentes de Rincel.</span>
            </li>
          </ul>
        </div>
      </section>

      {recs.length ? (
        <section className="container-page mt-16" aria-labelledby="relacionados">
          <h2 id="relacionados" className="text-2xl">
            También te puede servir
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recs.map((r) => (
              <ProductCard key={r.id} product={r} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="container-page mt-16 max-w-3xl" aria-labelledby="dudas">
        <h2 id="dudas" className="text-2xl">
          Preguntas frecuentes
        </h2>
        <div className="mt-5">
          <FaqList items={faqFor(product.category === "datos" ? "datos" : product.category === "equipo" ? "mifi" : product.category === "kit" ? "kit" : "planes", 5)} />
        </div>
      </section>
    </div>
  );
}
