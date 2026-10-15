import type { DeliveryKind, ProductCategory, ProductStatus, SimType } from "@/lib/domain/types";

/**
 * Catálogo base: 13 productos definidos por el negocio. Los precios coinciden
 * con `assets-rincel/catalogo-base.json` (verificado en pruebas). Los valores
 * null significan "pendiente o no aplica", nunca cero.
 *
 * Reglas importantes:
 * - Lo que no está confirmado vive en `internalPending` y nunca se publica.
 * - La eSIM solo está habilitada en el paquete 2×1.
 * - El texto del negocio prevalece sobre los carteles comerciales.
 */

export interface SeedVariant {
  code: string;
  label: string;
  simType: SimType | null;
  delivery: DeliveryKind;
  components: { componentId: string; quantity: number }[];
}

export interface SeedProduct {
  id: string;
  name: string;
  shortName: string;
  category: ProductCategory;
  status: ProductStatus;
  chargeable: boolean;
  priceCents: number;
  dataGb: number | null;
  validityDays: number | null;
  socialDataGb: number | null;
  socialUnlimited: boolean;
  linesPerUnit: number;
  tagline: string;
  description: string;
  features: string[];
  requirements: string[];
  conditions: string[];
  priceNote: string | null;
  ctaLabel: string;
  internalPending: string[];
  imagePath: string | null;
  imageAlt: string;
  imageReviewRequired: boolean;
  altImagePath: string | null;
  altImageAlt: string | null;
  sortOrder: number;
  seoDescription: string;
  variants: SeedVariant[];
}

export interface SeedComponent {
  id: string;
  name: string;
  notes: string;
}

export const SEED_COMPONENTS: SeedComponent[] = [
  { id: "sim-rincel", name: "Chip Rincel para línea (portabilidad / línea nueva)", notes: "Compartido por planes y kit colaborador. Ajustar si el kit usa otro lote." },
  { id: "sim-datos", name: "Chip Rincel solo datos (MiRin)", notes: "Compartido por los 4 chips de datos. Ajustar si cada plan usa un chip distinto." },
  { id: "mifi-satco-f02", name: "MiFi SATCO F-02", notes: "Confirmar contenido de la caja y paquete inicial." },
  { id: "volantes-kit", name: "Paquete de volantes de apoyo (kit)", notes: "Un paquete por kit." },
];

const planConditions = [
  "Redes sociales ilimitadas sujetas a las condiciones vigentes de Rincel.",
  "La vigencia de 30 días aplica a este pago; no es una promesa de precio para recargas futuras.",
  "Comprar no activa la línea automáticamente: te acompañamos en la activación después del pago.",
];

const portabilityConditions = [
  "Los GB indicados corresponden a la promoción de portabilidad vigente de Rincel.",
  ...planConditions,
  "La portabilidad se gestiona después del pago siguiendo el proceso de Rincel; nunca te pediremos tu NIP en el carrito.",
];

const pendingSocial = "Confirmar apps incluidas, límites y política de uso de redes sociales ilimitadas.";
const pendingPortability = "Confirmar proceso operativo de portabilidad (datos requeridos, canal privado y tiempos).";

const physicalSim = (label = "Chip físico"): SeedVariant => ({
  code: "fisico",
  label,
  simType: "fisico",
  delivery: "physical",
  components: [{ componentId: "sim-rincel", quantity: 1 }],
});

const dataSim = (): SeedVariant => ({
  code: "fisico",
  label: "Chip físico solo datos",
  simType: "fisico",
  delivery: "physical",
  components: [{ componentId: "sim-datos", quantity: 1 }],
});

function portabilityPlan(id: string, shortName: string, price: number, gb: number, sortOrder: number): SeedProduct {
  return {
    id,
    name: `${shortName} — Portabilidad`,
    shortName,
    category: "portabilidad",
    status: "active",
    chargeable: true,
    priceCents: price * 100,
    dataGb: gb,
    validityDays: 30,
    socialDataGb: null,
    socialUnlimited: true,
    linesPerUnit: 1,
    tagline: `${gb} GB con promoción de portabilidad · 30 días`,
    description: `Cámbiate a Rincel conservando tu número. ${gb} GB para navegar con la promoción de portabilidad, 30 días de vigencia, redes sociales ilimitadas sujetas a condiciones y posibilidad de compartir datos.`,
    features: [
      `${gb} GB para navegar con promoción de portabilidad`,
      "30 días de vigencia",
      "Conservas tu número",
      "Redes sociales ilimitadas (sujetas a condiciones)",
      "Permite compartir datos",
    ],
    requirements: ["Equipo liberado y compatible con la red de Rincel", "Portar tu número actual a Rincel"],
    conditions: portabilityConditions,
    priceNote: null,
    ctaLabel: "Elegir este plan",
    internalPending: [pendingSocial, pendingPortability],
    imagePath: `/productos/${id}.webp`,
    imageAlt: `Cartel comercial ${shortName} Portabilidad: chip Rincel, ${gb} GB para navegar, 30 días de vigencia, redes sociales ilimitadas sujetas a condiciones, conserva tu número, $${price} MXN.`,
    imageReviewRequired: false,
    altImagePath: null,
    altImageAlt: null,
    sortOrder,
    seoDescription: `${shortName} Portabilidad: ${gb} GB con promoción de portabilidad por $${price} MXN, 30 días, conservas tu número.`,
    variants: [physicalSim()],
  };
}

function newLinePlan(id: string, shortName: string, price: number, gb: number, sortOrder: number): SeedProduct {
  return {
    id,
    name: `${shortName} — Línea nueva`,
    shortName,
    category: "linea_nueva",
    status: "active",
    chargeable: true,
    priceCents: price * 100,
    dataGb: gb,
    validityDays: 30,
    socialDataGb: null,
    socialUnlimited: true,
    linesPerUnit: 1,
    tagline: `${gb} GB · 30 días · número nuevo`,
    description: `Estrena número con Rincel. ${gb} GB para navegar, 30 días de vigencia, redes sociales ilimitadas sujetas a condiciones y posibilidad de compartir datos.`,
    features: [`${gb} GB para navegar`, "30 días de vigencia", "Incluye número nuevo", "Redes sociales ilimitadas (sujetas a condiciones)", "Permite compartir datos"],
    requirements: ["Equipo liberado y compatible con la red de Rincel"],
    conditions: planConditions,
    priceNote: null,
    ctaLabel: "Quiero una línea nueva",
    internalPending: [pendingSocial],
    imagePath: `/productos/${id}.webp`,
    imageAlt: `Cartel comercial ${shortName} Línea nueva: chip Rincel, ${gb} GB para navegar, 30 días de vigencia, redes sociales ilimitadas sujetas a condiciones, estrena tu número, $${price} MXN.`,
    imageReviewRequired: false,
    altImagePath: null,
    altImageAlt: null,
    sortOrder,
    seoDescription: `${shortName} Línea nueva: ${gb} GB por $${price} MXN, 30 días, número nuevo.`,
    variants: [physicalSim()],
  };
}

function dataChip(id: string, price: number, gb: number, days: number, socialGb: number, code: string, sortOrder: number): SeedProduct {
  const socialMb = (socialGb * 1000).toLocaleString("es-MX");
  return {
    id,
    name: `Chip ${gb} GB / ${days} días`,
    shortName: `Chip ${gb} GB / ${days} días`,
    category: "datos",
    status: "active",
    chargeable: true,
    priceCents: price * 100,
    dataGb: gb,
    validityDays: days,
    socialDataGb: socialGb,
    socialUnlimited: false,
    linesPerUnit: 1,
    tagline: `${code} · ${gb} GB para navegar + ${socialGb} GB para redes sociales`,
    description: `Chip Rincel de solo datos (${code}): ${gb} GB para navegar y una bolsa aparte de ${socialGb} GB (${socialMb} MB) para redes sociales, con ${days} días de vigencia. No incluye equipo MiFi.`,
    features: [
      `${gb} GB para navegar`,
      `Bolsa aparte de ${socialGb} GB (${socialMb} MB) para redes sociales`,
      `${days} días de vigencia`,
      "Chip Rincel de solo datos",
    ],
    requirements: ["Dispositivo compatible con chip de datos", "No incluye equipo MiFi"],
    conditions: [
      "La bolsa de redes sociales es independiente: no se suma a los GB de navegación.",
      "No es un plan ilimitado.",
      "Uso de redes sociales sujeto a las condiciones vigentes de Rincel.",
      "No incluye equipo MiFi.",
    ],
    priceNote: null,
    ctaLabel: "Elegir este plan",
    internalPending: ["Confirmar apps incluidas en la bolsa de redes sociales y si el chip de datos permite llamadas o SMS."],
    imagePath: `/productos/${id}.webp`,
    imageAlt: `Cartel comercial chip solo datos ${code}: ${gb} GB para navegar, ${days} días de vigencia, más ${socialMb} MB para redes sociales, $${price} MXN, equipo MiFi no incluido.`,
    imageReviewRequired: false,
    altImagePath: null,
    altImageAlt: null,
    sortOrder,
    seoDescription: `Chip Rincel solo datos ${code}: ${gb} GB + ${socialGb} GB para redes sociales por $${price} MXN, ${days} días.`,
    variants: [dataSim()],
  };
}

export const SEED_PRODUCTS: SeedProduct[] = [
  portabilityPlan("rino-150-portabilidad", "Rino 150", 150, 12, 10),
  portabilityPlan("rino-230-portabilidad", "Rino 230", 230, 36, 20),
  {
    id: "rino-230-portabilidad-2x1",
    name: "Rino 230 — Promoción 2×1",
    shortName: "Rino 230 2×1",
    category: "portabilidad",
    status: "active",
    chargeable: true,
    priceCents: 23000,
    // GB, vigencia y precio posterior por línea: pendientes de confirmar. No se infieren del plan individual.
    dataGb: null,
    validityDays: null,
    socialDataGb: null,
    socialUnlimited: false,
    linesPerUnit: 2,
    tagline: "2 líneas por $230 en total en el primer pago",
    description:
      "Paquete de dos líneas por $230 MXN en total en el primer pago. Aplica con portabilidad de ambas líneas y cada línea conserva su número. Elige chip físico o eSIM. Después del primer pago, cada línea se recarga por separado.",
    features: ["Dos líneas por $230 en total (primer pago)", "Cada línea conserva su número", "Chip físico o eSIM", "Después, cada línea se recarga por separado"],
    requirements: [
      "Portabilidad de ambas líneas",
      "Dos equipos liberados y compatibles con la red de Rincel",
      "Para eSIM: ambos equipos deben ser compatibles con eSIM",
    ],
    conditions: [
      "Promoción válida solo en el primer pago; después cada línea se recarga individualmente.",
      "Una unidad en el carrito equivale a un paquete de dos líneas.",
      "Los GB y la vigencia de cada línea no se publican todavía: consúltalos con nuestro equipo antes de comprar.",
      "Comprar no activa las líneas ni completa la portabilidad automáticamente; nunca te pediremos tu NIP en el carrito.",
    ],
    priceNote: "$230 por las dos líneas en el primer pago. Después, cada línea se recarga por separado.",
    ctaLabel: "Comprar dos líneas por $230",
    internalPending: [
      "Confirmar GB y vigencia por línea del 2×1.",
      "Confirmar precio de recarga posterior por línea.",
      "Confirmar si se puede mezclar chip físico y eSIM en el mismo paquete (por ahora: ambas físicas o ambas eSIM).",
      "Confirmar si el 2×1 incluye redes sociales ilimitadas (aparece en el cartel, no en la descripción del negocio).",
      pendingPortability,
    ],
    imagePath: "/productos/rino-230-portabilidad-2x1.webp",
    imageAlt:
      "Cartel comercial Rino 230 Portabilidad 2×1: dos chips Rincel, 2 líneas por $230 solo el primer pago, chip físico o eSIM; después cada línea se recarga por separado.",
    imageReviewRequired: false,
    altImagePath: null,
    altImageAlt: null,
    sortOrder: 30,
    seoDescription: "Promoción 2×1 Rincel: dos líneas con portabilidad por $230 MXN en total en el primer pago. Chip físico o eSIM.",
    variants: [
      {
        code: "fisico",
        label: "2 chips físicos",
        simType: "fisico",
        delivery: "physical",
        components: [{ componentId: "sim-rincel", quantity: 2 }],
      },
      { code: "esim", label: "2 eSIM (entrega digital)", simType: "esim", delivery: "digital", components: [] },
    ],
  },
  portabilityPlan("rino-300-portabilidad", "Rino 300", 300, 48, 40),
  newLinePlan("rino-230-linea-nueva", "Rino 230", 230, 12, 50),
  newLinePlan("rino-250-linea-nueva", "Rino 250", 250, 15, 60),
  newLinePlan("rino-300-linea-nueva", "Rino 300", 300, 24, 70),
  dataChip("chip-datos-10gb-7dias", 140, 10, 7, 1, "MiRin 7-10", 80),
  dataChip("chip-datos-20gb-7dias", 180, 20, 7, 1, "MiRin 7-20", 90),
  dataChip("chip-datos-10gb-30dias", 230, 10, 30, 3, "MiRin 30-10", 100),
  dataChip("chip-datos-20gb-30dias", 340, 20, 30, 3, "MiRin 30-20", 110),
  {
    id: "mifi-rincel",
    name: "MiFi Rincel — Internet portátil",
    shortName: "MiFi Rincel",
    category: "equipo",
    status: "active",
    chargeable: true,
    priceCents: 105000,
    dataGb: null,
    validityDays: null,
    socialDataGb: null,
    socialUnlimited: false,
    linesPerUnit: 0,
    tagline: "Módem portátil 4G LTE para compartir internet por Wi-Fi",
    description:
      "Módem portátil 4G LTE que comparte internet por Wi-Fi. Compacto y blanco. Funciona con servicio prepago mediante recargas de datos y está sujeto a cobertura. Ficha técnica del equipo: SATCO F-02.",
    features: ["Módem portátil 4G LTE", "Comparte internet por Wi-Fi", "Compacto y portátil, color blanco", "Servicio prepago por recargas de datos", "Equipo SATCO F-02"],
    requirements: ["Requiere recargas de datos para navegar (servicio prepago)", "Uso sujeto a cobertura"],
    conditions: ["Servicio sujeto a cobertura.", "La velocidad depende de la cobertura y condiciones de la red; no se garantiza una velocidad específica."],
    priceNote: null,
    ctaLabel: "Comprar mi MiFi",
    internalPending: [
      "Confirmar número máximo de dispositivos conectados (cartel dice 10; ficha SATCO indica 8).",
      "Confirmar autonomía de batería, accesorios incluidos y si trae chip o paquete inicial.",
      "No usar la ficha de Alcatel de otra publicación.",
      "Reemplazar o aprobar la imagen comercial mifi-rincel.jpg cuando se confirme el dato de conexiones.",
    ],
    // Se publica la alternativa sin texto; el cartel con "hasta 10 dispositivos" queda en revisión.
    imagePath: "/productos/mifi-rincel.webp",
    imageAlt: "Cartel comercial MiFi Rincel con afirmaciones pendientes de confirmar.",
    imageReviewRequired: true,
    altImagePath: "/productos/mifi-rincel-sin-texto.webp",
    altImageAlt: "Módem MiFi Rincel blanco con pantalla y la leyenda 4G LTE, sobre fondo claro.",
    sortOrder: 120,
    seoDescription: "MiFi Rincel: módem portátil 4G LTE para compartir internet por Wi-Fi. $1,050 MXN. Servicio prepago sujeto a cobertura.",
    variants: [
      {
        code: "unico",
        label: "Equipo MiFi",
        simType: null,
        delivery: "physical",
        components: [{ componentId: "mifi-satco-f02", quantity: 1 }],
      },
    ],
  },
  {
    id: "kit-colaborador",
    name: "Kit colaborador Rincel",
    shortName: "Kit colaborador",
    category: "kit",
    status: "active",
    chargeable: true,
    priceCents: 35000,
    dataGb: null,
    validityDays: null,
    socialDataGb: null,
    socialUnlimited: false,
    linesPerUnit: 0,
    tagline: "12 chips Rincel, volantes y soporte para empezar a vender",
    description:
      "Kit para colaboradores que quieren vender Rincel: incluye 12 chips Rincel, volantes de apoyo para la venta y soporte/acompañamiento para activar líneas.",
    features: ["12 chips Rincel", "Volantes de apoyo para venta", "Soporte y acompañamiento para activar líneas"],
    requirements: [],
    conditions: ["Incluye únicamente chips, volantes y soporte.", "No incluye saldo, planes activados, ingresos ni comisiones."],
    priceNote: null,
    ctaLabel: "Empezar a vender Rincel",
    internalPending: ["Confirmar si los chips del kit son del mismo lote que los planes (inventario compartido)."],
    imagePath: "/productos/kit-colaborador.webp",
    imageAlt: "Cartel comercial Kit colaborador: chips Rincel y volantes de apoyo; 12 chips Rincel, volantes de apoyo, soporte para activar líneas, $350 MXN.",
    imageReviewRequired: false,
    altImagePath: null,
    altImageAlt: null,
    sortOrder: 130,
    seoDescription: "Kit colaborador Rincel: 12 chips, volantes de apoyo y soporte para activar líneas por $350 MXN.",
    variants: [
      {
        code: "unico",
        label: "Kit (12 chips + volantes)",
        simType: null,
        delivery: "physical",
        components: [
          { componentId: "sim-rincel", quantity: 12 },
          { componentId: "volantes-kit", quantity: 1 },
        ],
      },
    ],
  },
];

/** Pendientes internos que no pertenecen a un producto en particular. */
export const GLOBAL_PENDING = [
  "Producto 14: se mencionó pero no está definido ni tiene imagen. No se publica.",
  "Dominio definitivo del sitio.",
  "Credenciales de Mercado Pago (pruebas y producción) e ID de la cuenta receptora.",
  "Proveedor de envíos, dirección de origen, pesos, medidas y empaque reales.",
  "Inventario inicial real por componente.",
  "Correo remitente y proveedor de correo (SMTP).",
  "Teléfono / WhatsApp definitivo de atención.",
  "Condiciones comerciales vigentes de Rincel, apps y uso de redes sociales.",
  "Proceso de activación, portabilidad y eSIM confirmado por Rincel.",
  "Políticas legales y datos fiscales del vendedor.",
];
