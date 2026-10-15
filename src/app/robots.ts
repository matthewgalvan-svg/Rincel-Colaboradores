import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const isProd = process.env.APP_ENV === "production";
  return {
    // Fuera de producción no se indexa nada.
    rules: isProd ? [{ userAgent: "*", allow: "/", disallow: ["/admin", "/checkout", "/carrito", "/pedido", "/api", "/pago-simulado"] }] : [{ userAgent: "*", disallow: "/" }],
    sitemap: `${base}/sitemap.xml`,
  };
}
