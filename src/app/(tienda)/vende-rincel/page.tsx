import type { Metadata } from "next";
import Image from "next/image";
import { PriceTag } from "@/components/product/ProductCard";
import { Icon } from "@/components/ui/Icon";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { getPublicProduct } from "@/lib/catalog/queries";
import { getSettings, publicContact } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Vende Rincel — Kit colaborador",
  description: "Empieza a vender Rincel con el kit colaborador: 12 chips Rincel, volantes de apoyo y soporte para activar líneas.",
  alternates: { canonical: "/vende-rincel" },
};

export default async function VendePage() {
  const [kit, settings] = await Promise.all([getPublicProduct("kit-colaborador"), getSettings()]);
  const contact = publicContact(settings);
  return (
    <div className="container-page pt-8">
      <div className="grid items-center gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="chip">Kit colaborador</p>
          <h1 className="mt-3 text-4xl sm:text-5xl">Empieza a vender Rincel</h1>
          <p className="mt-3 text-lg text-tinta-suave">Todo lo necesario para ofrecer líneas Rincel a tus clientes, con acompañamiento para activarlas.</p>
          <ul className="mt-6 space-y-3">
            {(kit?.features ?? ["12 chips Rincel", "Volantes de apoyo para venta", "Soporte y acompañamiento para activar líneas"]).map((f) => (
              <li key={f} className="flex gap-3 text-lg">
                <Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-exito" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl border border-borde bg-white p-4">
            <p className="font-extrabold text-marino">Qué no incluye</p>
            <p className="mt-1 text-sm text-tinta-suave">El kit incluye únicamente chips, volantes y soporte. No incluye saldo, planes activados, ingresos ni comisiones.</p>
          </div>
          {kit ? (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <PriceTag cents={kit.priceCents} size="lg" />
              <TrackedLink href={`/producto/${kit.id}`} ctaId="vender-kit" productId={kit.id} className="btn-primary text-lg">
                Empezar a vender Rincel
                <Icon name="arrow" />
              </TrackedLink>
            </div>
          ) : null}
          <p className="mt-4 text-sm">
            <TrackedLink href={contact.whatsappUrl ?? "/contacto"} external={Boolean(contact.whatsappUrl)} ctaId="vender-duda" className="link">
              Resolver una duda
            </TrackedLink>
          </p>
        </div>
        {kit?.image ? <Image src={kit.image.src} alt={kit.image.alt} width={1254} height={1254} sizes="(max-width: 768px) 92vw, 480px" className="h-auto w-full rounded-[1.25rem] border border-borde/60" loading="eager" fetchPriority="high" /> : null}
      </div>
    </div>
  );
}
