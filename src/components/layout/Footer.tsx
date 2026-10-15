import Link from "next/link";
import { FullLogo } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

export function Footer({ sellerName, contact }: { sellerName: string; contact: { whatsappUrl: string | null; email: string | null; phone: string | null; hours: string | null } }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t print:hidden border-borde/60 bg-celeste-50">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <FullLogo className="h-14 w-auto" />
          <p className="mt-3 text-sm font-extrabold text-morado">Colaboradores</p>
          <p className="mt-3 max-w-xs text-sm text-tinta-suave">
            {sellerName} comercializa servicios Rincel. Este no es el sitio corporativo oficial de Rincel.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-extrabold tracking-wide text-marino uppercase">Tienda</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-morado" href="/planes/portabilidad">Portabilidad</Link></li>
            <li><Link className="hover:text-morado" href="/planes/linea-nueva">Línea nueva</Link></li>
            <li><Link className="hover:text-morado" href="/planes/chips-datos">Chips de datos</Link></li>
            <li><Link className="hover:text-morado" href="/planes/mifi">MiFi</Link></li>
            <li><Link className="hover:text-morado" href="/vende-rincel">Kit colaborador</Link></li>
            <li><Link className="hover:text-morado" href="/comparar">Comparar planes</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-extrabold tracking-wide text-marino uppercase">Ayuda</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-morado" href="/pedido">Consultar mi pedido</Link></li>
            <li><Link className="hover:text-morado" href="/seguimiento">Seguimiento de envío</Link></li>
            <li><Link className="hover:text-morado" href="/preguntas-frecuentes">Preguntas frecuentes</Link></li>
            <li><Link className="hover:text-morado" href="/contacto">Contacto</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-extrabold tracking-wide text-marino uppercase">Políticas</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-morado" href="/politicas/privacidad">Aviso de privacidad</Link></li>
            <li><Link className="hover:text-morado" href="/politicas/terminos">Términos y condiciones</Link></li>
            <li><Link className="hover:text-morado" href="/politicas/envios">Envíos</Link></li>
            <li><Link className="hover:text-morado" href="/politicas/devoluciones">Devoluciones y reembolsos</Link></li>
          </ul>
          {contact.whatsappUrl || contact.email ? (
            <ul className="mt-4 space-y-2 text-sm">
              {contact.whatsappUrl ? (
                <li>
                  <a className="inline-flex items-center gap-2 font-bold text-morado hover:underline" href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer" data-cta="footer-whatsapp">
                    <Icon name="chat" className="h-4 w-4" /> WhatsApp
                  </a>
                </li>
              ) : null}
              {contact.email ? (
                <li>
                  <a className="inline-flex items-center gap-2 font-bold text-morado hover:underline" href={`mailto:${contact.email}`}>
                    <Icon name="mail" className="h-4 w-4" /> {contact.email}
                  </a>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="border-t border-borde/60">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-tinta-suave sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {sellerName}. Precios en pesos mexicanos (MXN).</p>
          <p className="inline-flex items-center gap-1.5">
            <Icon name="shield" className="h-4 w-4" /> Pagos procesados por Mercado Pago. No almacenamos datos de tarjetas.
          </p>
        </div>
      </div>
    </footer>
  );
}
