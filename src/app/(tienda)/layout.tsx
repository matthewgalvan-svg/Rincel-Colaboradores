import Link from "next/link";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { CartProvider } from "@/components/cart/CartProvider";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { env } from "@/lib/env";
import { getSettings, publicContact } from "@/lib/settings";

/** La tienda lee configuración y existencias en cada solicitud (sin acceso a la base al compilar). */
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const e = env();
  return (
    <CartProvider>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-bold">
        Saltar al contenido
      </a>
      {settings.announcement.enabled && settings.announcement.text ? (
        <div className="bg-marino text-center text-sm font-bold text-white print:hidden">
          <div className="container-page py-2">
            {settings.announcement.href ? (
              <Link href={settings.announcement.href} className="underline underline-offset-4">
                {settings.announcement.text}
              </Link>
            ) : (
              settings.announcement.text
            )}
          </div>
        </div>
      ) : null}
      {e.APP_ENV !== "production" ? (
        <div className="bg-[#fff6e5] text-center text-xs font-bold text-alerta print:hidden">
          <div className="container-page py-1.5">Entorno de pruebas: los pagos y envíos {e.PAYMENT_PROVIDER === "simulated" ? "son simulados" : "usan credenciales de prueba"}. No se realizan cobros reales.</div>
        </div>
      ) : null}
      <Header />
      <main id="contenido">{children}</main>
      <Footer sellerName={settings.sellerName} contact={publicContact(settings)} />
      <AnalyticsProvider ga4Id={e.GA4_MEASUREMENT_ID ?? null} metaPixelId={e.META_PIXEL_ID ?? null} />
    </CartProvider>
  );
}
