import type { Metadata } from "next";
import { FaqList } from "@/components/ui/Faq";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { FAQ } from "@/content/faq";
import { getSettings, publicContact } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description: "Respuestas sobre portabilidad, línea nueva, promoción 2×1, chips de datos, MiFi, pagos con Mercado Pago, envíos y activación.",
  alternates: { canonical: "/preguntas-frecuentes" },
};

export default async function FaqPage() {
  const contact = publicContact(await getSettings());
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <div className="container-page max-w-3xl pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <h1 className="text-3xl sm:text-4xl">Preguntas frecuentes</h1>
      <p className="mt-2 text-lg text-tinta-suave">Si no encuentras tu respuesta, escríbenos.</p>
      <div className="mt-6">
        <FaqList items={FAQ} />
      </div>
      <TrackedLink href={contact.whatsappUrl ?? "/contacto"} external={Boolean(contact.whatsappUrl)} ctaId="faq-resolver-duda" className="btn-primary mt-8">
        Resolver una duda
      </TrackedLink>
    </div>
  );
}
