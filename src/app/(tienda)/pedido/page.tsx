import type { Metadata } from "next";
import { LookupForm } from "@/components/order/LookupForm";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Consultar mi pedido", robots: { index: false, follow: true } };

export default function ConsultaPedidoPage() {
  return (
    <div className="container-page max-w-3xl pt-8">
      <h1 className="text-3xl sm:text-4xl">Consultar mi pedido</h1>
      <p className="mt-2 text-lg text-tinta-suave">Cada pedido se consulta con un enlace privado que te mostramos al comprar y enviamos a tu correo. Si lo perdiste, te lo reenviamos.</p>
      <div className="mt-6">
        <LookupForm />
      </div>
      <ul className="mt-6 space-y-2 text-sm text-tinta-suave">
        <li className="flex gap-2">
          <Icon name="shield" className="h-4 w-4 shrink-0" /> Por seguridad, el número de pedido por sí solo no muestra tus datos.
        </li>
        <li className="flex gap-2">
          <Icon name="mail" className="h-4 w-4 shrink-0" /> El enlace llega solo al correo registrado en la compra.
        </li>
      </ul>
    </div>
  );
}
