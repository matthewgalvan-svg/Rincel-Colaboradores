import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { getSettings, publicContact } from "@/lib/settings";
import { ContactForm } from "./contact-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contacto", description: "Escríbenos para resolver dudas sobre planes, pedidos, envíos o activación.", alternates: { canonical: "/contacto" } };

export default async function ContactoPage() {
  const s = await getSettings();
  const c = publicContact(s);
  return (
    <div className="container-page max-w-4xl pt-8">
      <h1 className="text-3xl sm:text-4xl">Contacto</h1>
      <p className="mt-2 text-lg text-tinta-suave">¿Tienes una duda antes o después de comprar? Estamos para ayudarte.</p>
      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          {c.whatsappUrl ? (
            <TrackedLink href={c.whatsappUrl} external ctaId="contacto-whatsapp" className="card flex items-center gap-3 p-4 hover:border-morado">
              <Icon name="chat" className="h-6 w-6 text-morado" />
              <span>
                <span className="block font-extrabold text-marino">WhatsApp</span>
                <span className="text-sm text-tinta-suave">Escríbenos por chat</span>
              </span>
            </TrackedLink>
          ) : null}
          {c.email ? (
            <a href={`mailto:${c.email}`} className="card flex items-center gap-3 p-4 hover:border-morado">
              <Icon name="mail" className="h-6 w-6 text-morado" />
              <span>
                <span className="block font-extrabold text-marino">Correo</span>
                <span className="text-sm text-tinta-suave">{c.email}</span>
              </span>
            </a>
          ) : null}
          {c.phone ? (
            <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="card flex items-center gap-3 p-4 hover:border-morado">
              <Icon name="phone" className="h-6 w-6 text-morado" />
              <span>
                <span className="block font-extrabold text-marino">Teléfono</span>
                <span className="text-sm text-tinta-suave">{c.phone}</span>
              </span>
            </a>
          ) : null}
          {c.hours ? <p className="text-sm text-tinta-suave">Horario de atención: {c.hours}</p> : null}
          {!c.whatsappUrl && !c.email && !c.phone ? <p className="text-sm text-tinta-suave">Usa el formulario y te responderemos al correo que nos dejes.</p> : null}
          <p className="text-sm text-tinta-suave">Nunca compartas tu NIP, contraseñas ni datos de tarjeta por este medio.</p>
        </div>
        <ContactForm />
      </div>
    </div>
  );
}
