import type { Metadata } from "next";
import { LookupForm } from "@/components/order/LookupForm";
import { SHIPPING_STATUS_LABELS } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Seguimiento de envío", description: "Consulta el estado de envío de tu pedido Rincel Colaboradores con tu enlace privado.", alternates: { canonical: "/seguimiento" } };

const STEPS = ["pending", "label_created", "picked_up", "in_transit", "delivered"] as const;

export default function SeguimientoPage() {
  return (
    <div className="container-page max-w-3xl pt-8">
      <h1 className="text-3xl sm:text-4xl">Seguimiento de envío</h1>
      <p className="mt-2 text-lg text-tinta-suave">El seguimiento está dentro de tu pedido. Ábrelo con tu enlace privado o solicítalo aquí.</p>
      <div className="mt-6">
        <LookupForm />
      </div>
      <section className="mt-10" aria-labelledby="etapas">
        <h2 id="etapas" className="text-2xl">
          ¿Qué significa cada estado?
        </h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-celeste font-extrabold text-marino">{i + 1}</span>
              <div>
                <p className="font-bold text-marino">{SHIPPING_STATUS_LABELS[s]}</p>
                <p className="text-sm text-tinta-suave">
                  {
                    {
                      pending: "Pago acreditado; estamos preparando tu paquete.",
                      label_created: "Generamos la guía. La paquetería todavía no recolecta el paquete.",
                      picked_up: "La paquetería ya tiene tu paquete.",
                      in_transit: "Tu paquete va en camino.",
                      delivered: "La paquetería reporta la entrega.",
                    }[s]
                  }
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-tinta-suave">Si hay una incidencia, la verás en tu pedido y te contactaremos.</p>
      </section>
    </div>
  );
}
