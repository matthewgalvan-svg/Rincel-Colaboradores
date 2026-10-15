"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { track } from "@/components/analytics/track";
import { Icon, type IconName } from "@/components/ui/Icon";

type Step = "inicio" | "internet" | "resultado";
interface Result {
  title: string;
  text: string;
  href: string;
  cta: string;
}

const RESULTS: Record<string, Result> = {
  conservar: { title: "Te conviene un plan de portabilidad", text: "Conservas tu número y obtienes los GB de la promoción de portabilidad. Si son dos líneas, revisa la promoción 2×1.", href: "/planes/portabilidad", cta: "Ver planes de portabilidad" },
  nueva: { title: "Te conviene una línea nueva", text: "Estrenas número con 30 días de vigencia y redes sociales ilimitadas sujetas a condiciones.", href: "/planes/linea-nueva", cta: "Quiero una línea nueva" },
  chip: { title: "Te conviene un chip de solo datos", text: "GB para navegar más una bolsa aparte para redes sociales. Necesitas un dispositivo compatible.", href: "/planes/chips-datos", cta: "Ver chips de datos" },
  mifi: { title: "Te conviene el MiFi Rincel", text: "Módem portátil 4G LTE para compartir internet por Wi-Fi. Funciona con recargas de datos y está sujeto a cobertura.", href: "/producto/mifi-rincel", cta: "Comprar mi MiFi" },
  vender: { title: "Empieza con el kit colaborador", text: "12 chips Rincel, volantes de apoyo y soporte para activar líneas.", href: "/vende-rincel", cta: "Empezar a vender Rincel" },
};

/** Ayudante breve (1–2 preguntas) para elegir categoría. */
export function CategoryHelper() {
  const [step, setStep] = useState<Step>("inicio");
  const [result, setResult] = useState<Result | null>(null);

  const choose = (key: string) => {
    track("helper_answer", { ctaId: `ayudante-${key}` });
    if (key === "internet") {
      setStep("internet");
      return;
    }
    setResult(RESULTS[key]);
    setStep("resultado");
  };

  const Option = ({ k, icon, label, hint }: { k: string; icon: IconName; label: string; hint: string }) => (
    <button type="button" onClick={() => choose(k)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-borde bg-white px-4 py-3 text-left transition-colors hover:border-morado hover:bg-celeste-50">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-celeste text-morado">
        <Icon name={icon} />
      </span>
      <span>
        <span className="block font-extrabold text-marino">{label}</span>
        <span className="block text-sm text-tinta-suave">{hint}</span>
      </span>
    </button>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-borde/60 bg-celeste-50 px-5 py-3">
        <Image src="/marca/rincelito.webp" alt="" width={48} height={53} className="h-12 w-auto" />
        <div>
          <p className="font-extrabold text-marino">Rincelito te ayuda a elegir</p>
          <p className="text-sm text-tinta-suave">Responde una o dos preguntas.</p>
        </div>
      </div>
      <div className="p-5" aria-live="polite">
        {step === "inicio" ? (
          <fieldset>
            <legend className="mb-3 text-lg font-extrabold text-marino">¿Qué necesitas?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Option k="conservar" icon="swap" label="Conservar mi número" hint="Me cambio a Rincel" />
              <Option k="nueva" icon="phone" label="Un número nuevo" hint="Quiero estrenar línea" />
              <Option k="internet" icon="wifi" label="Solo internet" hint="Para tableta, módem o compartir" />
              <Option k="vender" icon="store" label="Vender Rincel" hint="Quiero ser colaborador" />
            </div>
          </fieldset>
        ) : null}
        {step === "internet" ? (
          <fieldset>
            <legend className="mb-3 text-lg font-extrabold text-marino">¿Cómo lo vas a usar?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Option k="chip" icon="chip" label="En un dispositivo que ya tengo" hint="Chip de solo datos" />
              <Option k="mifi" icon="wifi" label="Compartir por Wi-Fi" hint="Necesito el equipo MiFi" />
            </div>
            <button type="button" className="btn-ghost mt-2 px-0" onClick={() => setStep("inicio")}>
              ← Volver
            </button>
          </fieldset>
        ) : null}
        {step === "resultado" && result ? (
          <div>
            <p className="text-lg font-extrabold text-marino">{result.title}</p>
            <p className="mt-1 text-tinta-suave">{result.text}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={result.href} className="btn-primary" onClick={() => track("cta_click", { ctaId: `ayudante-resultado` })}>
                {result.cta}
                <Icon name="arrow" />
              </Link>
              <button type="button" className="btn-secondary" onClick={() => setStep("inicio")}>
                Empezar de nuevo
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
