import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FullLogo } from "@/components/brand/Logo";
import { CompareTable } from "@/components/compare/CompareTable";
import { CategoryHelper } from "@/components/home/CategoryHelper";
import { PriceTag, ProductCard } from "@/components/product/ProductCard";
import { FaqList } from "@/components/ui/Faq";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { FAQ } from "@/content/faq";
import { listPublicProducts } from "@/lib/catalog/queries";
import { getSettings, publicContact } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

const QUICK: { href: string; icon: IconName; title: string; text: string; cta: string }[] = [
  { href: "/planes/portabilidad", icon: "swap", title: "Quiero conservar mi número", text: "Planes de portabilidad y 2×1", cta: "home-acceso-portabilidad" },
  { href: "/planes/linea-nueva", icon: "phone", title: "Quiero una línea nueva", text: "Estrena número desde $230", cta: "home-acceso-linea-nueva" },
  { href: "/planes/chips-datos", icon: "wifi", title: "Necesito internet", text: "Chips de datos y MiFi", cta: "home-acceso-internet" },
  { href: "/vende-rincel", icon: "store", title: "Quiero vender Rincel", text: "Kit colaborador", cta: "home-acceso-vender" },
];

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "spark", title: "Elige tu plan", text: "Compara precio, GB y vigencia. Decide entre portabilidad, línea nueva o solo datos." },
  { icon: "card", title: "Paga con Mercado Pago", text: "Tu pedido se confirma cuando Mercado Pago acredita el pago. No guardamos datos de tarjetas." },
  { icon: "truck", title: "Recibe tu chip o eSIM", text: "Los chips físicos se envían con costo cotizado antes de pagar. La eSIM se entrega en digital." },
  { icon: "chat", title: "Te acompañamos", text: "Nuestro equipo te contacta para la activación o portabilidad. No es automática al comprar." },
];

export default async function HomePage() {
  const [products, settings] = await Promise.all([listPublicProducts(), getSettings()]);
  const contact = publicContact(settings);
  const promo = products.find((p) => p.id === "rino-230-portabilidad-2x1");
  const mifi = products.find((p) => p.id === "mifi-rincel");
  const featured = ["rino-230-portabilidad", "rino-230-linea-nueva", "chip-datos-10gb-30dias"].map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const comparison = products.filter((p) => (p.category === "portabilidad" || p.category === "linea_nueva") && p.linesPerUnit === 1);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const orgLd = { "@context": "https://schema.org", "@type": "Organization", name: settings.sellerName, url: appUrl, logo: `${appUrl}/marca/logo-rincel.svg` };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, "\\u003c") }} />
      {/* Héroe */}
      <section className="relative overflow-hidden bg-gradient-to-b from-celeste-50 via-white to-white">
        <div className="container-page grid items-center gap-6 pt-8 pb-10 md:grid-cols-[1.1fr_0.9fr] md:pt-12">
          <div>
            <FullLogo className="h-12 w-auto sm:h-14" />
            <h1 className="mt-6 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">{settings.home.heroTitle}</h1>
            <p className="mt-4 max-w-xl text-lg text-tinta-suave">{settings.home.heroSubtitle}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <TrackedLink href="#elige" ctaId="hero-encuentra-plan" className="btn-primary text-lg">
                {settings.home.primaryCta}
                <Icon name="arrow" />
              </TrackedLink>
              <TrackedLink href="/planes/portabilidad" ctaId="hero-conserva-numero" className="btn-secondary text-lg">
                {settings.home.secondaryCta}
              </TrackedLink>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-tinta-suave">
              <li className="inline-flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-exito" /> Pago único, sin cobros automáticos</li>
              <li className="inline-flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-exito" /> Precios en MXN</li>
              <li className="inline-flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-exito" /> Envío cotizado antes de pagar</li>
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-sm md:max-w-md">
            <div aria-hidden="true" className="absolute inset-x-6 top-10 bottom-0 rounded-[45%] bg-celeste" />
            <Image src="/marca/rincelito.webp" alt="Rincelito, la mascota de Rincel: un rinoceronte gris con chaleco azul que sostiene un celular" width={811} height={900} loading="eager" fetchPriority="high" sizes="(max-width: 768px) 80vw, 420px" className="relative mx-auto h-auto w-[78%] md:w-full" />
          </div>
        </div>
      </section>

      {/* Accesos rápidos */}
      <section className="container-page -mt-2" aria-label="Accesos rápidos">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK.map((q) => (
            <li key={q.href}>
              <TrackedLink href={q.href} ctaId={q.cta} className="card flex h-full min-h-28 flex-col gap-2 p-4 transition-colors hover:border-morado sm:flex-row sm:items-center sm:gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-celeste text-morado">
                  <Icon name={q.icon} className="h-6 w-6" />
                </span>
                <span>
                  <span className="block leading-tight font-extrabold text-marino">{q.title}</span>
                  <span className="mt-0.5 block text-sm text-tinta-suave">{q.text}</span>
                </span>
              </TrackedLink>
            </li>
          ))}
        </ul>
      </section>

      {/* Ayudante y destacados */}
      <section id="elige" className="container-page mt-16 scroll-mt-20" aria-labelledby="elige-titulo">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h2 id="elige-titulo" className="text-3xl">
              Encuentra tu plan
            </h2>
            <p className="mt-2 text-tinta-suave">Si ya sabes qué buscas, ve directo a los planes. Si no, Rincelito te orienta.</p>
            <div className="mt-5">
              <CategoryHelper />
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {featured.slice(0, 2).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      {/* Promoción 2×1 */}
      {promo ? (
        <section className="mt-20 bg-marino py-14 text-white" aria-labelledby="promo-2x1">
          <div className="container-page grid items-center gap-8 md:grid-cols-2">
            {promo.image ? (
              <Link href={`/producto/${promo.id}`} className="block overflow-hidden rounded-[1.25rem] bg-white">
                <Image src={promo.image.src} alt={promo.image.alt} width={1254} height={1254} sizes="(max-width: 768px) 92vw, 520px" className="h-auto w-full" />
              </Link>
            ) : null}
            <div>
              <p className="inline-flex rounded-full bg-turquesa px-3 py-1 text-xs font-extrabold text-marino">Promoción de portabilidad</p>
              <h2 id="promo-2x1" className="mt-3 text-3xl text-white sm:text-4xl">
                2 líneas por $230 en el primer pago
              </h2>
              <p className="mt-3 text-lg text-celeste">Cámbiate a Rincel con dos números y conserva ambos. Elige chip físico o eSIM.</p>
              <div className="mt-5 rounded-2xl bg-white p-5 text-marino">
                <PriceTag cents={promo.priceCents} size="lg" suffix="por las 2 líneas" />
                <p className="mt-2 font-bold">{promo.priceNote}</p>
                <ul className="mt-4 space-y-1.5 text-sm text-tinta-suave">
                  {promo.conditions.slice(0, 2).map((c) => (
                    <li key={c} className="flex gap-2">
                      <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-morado" />
                      {c}
                    </li>
                  ))}
                  <li className="flex gap-2">
                    <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-morado" />
                    Aplica con portabilidad de ambas líneas. Requiere equipos liberados y compatibles; la eSIM requiere equipos compatibles con eSIM.
                  </li>
                </ul>
                <TrackedLink href={`/producto/${promo.id}`} ctaId="home-promo-2x1" className="btn-primary mt-5 w-full text-lg" productId={promo.id}>
                  {promo.ctaLabel}
                  <Icon name="arrow" />
                </TrackedLink>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Comparador */}
      <section className="container-page mt-20" aria-labelledby="comparador">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="comparador" className="text-3xl">
              Compara en segundos
            </h2>
            <p className="mt-1 text-tinta-suave">Portabilidad conserva tu número; línea nueva estrena número.</p>
          </div>
          <TrackedLink href="/comparar" ctaId="home-comparar" className="btn-secondary">
            Comparar planes
          </TrackedLink>
        </div>
        <div className="mt-6">
          <CompareTable products={comparison} caption="Comparación de planes individuales" />
        </div>
        <p className="mt-3 text-xs text-tinta-suave">* Redes sociales ilimitadas sujetas a condiciones vigentes de Rincel. Requieren equipo liberado y compatible.</p>
      </section>

      {/* MiFi */}
      {mifi ? (
        <section className="container-page mt-20" aria-labelledby="mifi">
          <div className="card grid items-center gap-6 overflow-hidden p-6 md:grid-cols-2 md:p-10">
            <div>
              <p className="chip">Internet portátil</p>
              <h2 id="mifi" className="mt-3 text-3xl">
                MiFi Rincel
              </h2>
              <p className="mt-2 text-lg text-tinta-suave">{mifi.tagline}.</p>
              <ul className="mt-4 space-y-2">
                {mifi.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-exito" />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-tinta-suave">Servicio sujeto a cobertura. Los chips de datos se venden por separado.</p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <PriceTag cents={mifi.priceCents} />
                <TrackedLink href={`/producto/${mifi.id}`} ctaId="home-mifi" className="btn-primary" productId={mifi.id}>
                  {mifi.ctaLabel}
                  <Icon name="arrow" />
                </TrackedLink>
              </div>
            </div>
            {mifi.image ? <Image src={mifi.image.src} alt={mifi.image.alt} width={1254} height={1254} sizes="(max-width: 768px) 90vw, 480px" className="mx-auto h-auto w-full max-w-md" /> : null}
          </div>
        </section>
      ) : null}

      {/* Pasos */}
      <section className="container-page mt-20" aria-labelledby="pasos">
        <h2 id="pasos" className="text-3xl">
          Así compras
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-marino font-extrabold text-white">{i + 1}</span>
              <h3 className="mt-3 flex items-center gap-2 text-lg">
                <Icon name={s.icon} className="h-5 w-5 text-morado" /> {s.title}
              </h3>
              <p className="mt-1 text-sm text-tinta-suave">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Vender */}
      <section className="container-page mt-20" aria-labelledby="vender">
        <div className="grid items-center gap-6 rounded-[1.5rem] bg-celeste p-6 md:grid-cols-[1fr_auto] md:p-10">
          <div>
            <h2 id="vender" className="text-3xl">
              ¿Quieres vender Rincel?
            </h2>
            <p className="mt-2 max-w-2xl text-tinta">El kit colaborador incluye 12 chips Rincel, volantes de apoyo y soporte para activar líneas. No incluye saldo, planes activados ni promesas de ingresos.</p>
          </div>
          <TrackedLink href="/vende-rincel" ctaId="home-vender" className="btn-dark text-lg">
            Empezar a vender Rincel
          </TrackedLink>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-page mt-20 max-w-3xl" aria-labelledby="faq">
        <h2 id="faq" className="text-3xl">
          Preguntas frecuentes
        </h2>
        <div className="mt-6">
          <FaqList items={FAQ.slice(0, 6)} />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/preguntas-frecuentes" className="btn-secondary">
            Ver todas las preguntas
          </Link>
          <TrackedLink href={contact.whatsappUrl ?? "/contacto"} external={Boolean(contact.whatsappUrl)} ctaId="home-resolver-duda" className="btn-ghost">
            Resolver una duda
          </TrackedLink>
        </div>
      </section>
    </>
  );
}
