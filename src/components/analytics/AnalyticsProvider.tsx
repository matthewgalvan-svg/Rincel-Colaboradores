"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useSyncExternalStore } from "react";
import { captureAttribution, track } from "./track";

const CONSENT_KEY = "rincel.consentimiento";
type Consent = "granted" | "denied" | null;
const consentListeners = new Set<() => void>();

function readConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

function subscribeConsent(cb: () => void) {
  consentListeners.add(cb);
  return () => consentListeners.delete(cb);
}

/**
 * Registra vistas de página propias y, solo si el negocio configuró GA4 o
 * Meta y la persona aceptó, carga esas herramientas. Sin configuración no se
 * muestra ningún aviso emergente.
 */
export function AnalyticsProvider({ ga4Id, metaPixelId }: { ga4Id: string | null; metaPixelId: string | null }) {
  const pathname = usePathname();
  const external = Boolean(ga4Id || metaPixelId);
  // En el servidor y al hidratar no se conoce la preferencia: el aviso aparece después.
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => "denied" as Consent);

  useEffect(() => {
    captureAttribution();
  }, []);

  useEffect(() => {
    track("page_view");
  }, [pathname]);

  useEffect(() => {
    (window as unknown as { __rincelConsent?: boolean }).__rincelConsent = consent === "granted";
  }, [consent]);

  const decide = (v: "granted" | "denied") => {
    try {
      localStorage.setItem(CONSENT_KEY, v);
    } catch {
      /* ignorar */
    }
    consentListeners.forEach((l) => l());
  };

  return (
    <>
      {external && consent === "granted" && ga4Id ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(ga4Id)},{anonymize_ip:true});`}</Script>
        </>
      ) : null}
      {external && consent === "granted" && metaPixelId ? (
        <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(metaPixelId)});fbq('track','PageView');`}</Script>
      ) : null}
      {external && consent === null ? (
        <div role="region" aria-label="Preferencias de medición" className="fixed inset-x-3 top-20 z-40 mx-auto max-w-xl rounded-2xl border border-borde bg-white p-4 text-sm shadow-lg sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4">
          <p className="text-tinta-suave">
            Usamos medición propia sin datos personales. ¿Nos permites también usar Google Analytics y Meta para medir campañas? Consulta el{" "}
            <Link className="link" href="/politicas/privacidad">
              aviso de privacidad
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-dark min-h-10 px-4 text-sm" onClick={() => decide("granted")}>
              Aceptar
            </button>
            <button type="button" className="btn-secondary min-h-10 px-4 text-sm" onClick={() => decide("denied")}>
              Solo lo necesario
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function hasExternalConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}
