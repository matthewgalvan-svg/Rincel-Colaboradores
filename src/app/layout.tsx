import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap", weight: ["400", "600", "700", "800", "900"] });
const barlow = Barlow_Condensed({ subsets: ["latin"], variable: "--font-barlow", display: "swap", weight: ["700", "800"] });

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Rincel Colaboradores — Planes, chips de datos y MiFi", template: "%s · Rincel Colaboradores" },
  description: "Tienda de Rincel Colaboradores: planes con portabilidad, líneas nuevas, chips de solo datos, MiFi y kit colaborador. Pago seguro con Mercado Pago.",
  applicationName: "Rincel Colaboradores",
  openGraph: { type: "website", locale: "es_MX", siteName: "Rincel Colaboradores" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" data-scroll-behavior="smooth" className={`${nunito.variable} ${barlow.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
