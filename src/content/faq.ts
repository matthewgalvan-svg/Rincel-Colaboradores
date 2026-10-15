export interface FaqItem {
  id: string;
  q: string;
  a: string;
  topics: ("general" | "planes" | "datos" | "pagos" | "envios" | "kit" | "mifi")[];
}

/** Respuestas basadas solo en condiciones confirmadas por el negocio. */
export const FAQ: FaqItem[] = [
  {
    id: "activacion",
    q: "¿Comprar activa mi línea automáticamente?",
    a: "No. Cuando Mercado Pago acredita tu pago, nuestro equipo te contacta para continuar con la activación o la portabilidad siguiendo el proceso de Rincel. Nunca te pediremos tu NIP, contraseñas, documentos ni códigos SMS en el carrito.",
    topics: ["general", "planes"],
  },
  {
    id: "portabilidad",
    q: "¿Qué es la portabilidad?",
    a: "Es cambiarte a Rincel conservando tu número actual. Los planes de portabilidad incluyen los GB de la promoción de portabilidad indicados en cada plan, con 30 días de vigencia.",
    topics: ["general", "planes"],
  },
  {
    id: "requisitos",
    q: "¿Qué necesito para usar un plan Rincel?",
    a: "Un equipo liberado y compatible con la red de Rincel. Si eliges eSIM (disponible en la promoción 2×1), tu equipo también debe ser compatible con eSIM.",
    topics: ["planes"],
  },
  {
    id: "dosxuno",
    q: "¿Cómo funciona la promoción 2×1?",
    a: "Pagas $230 MXN en total por dos líneas en el primer pago. Aplica con portabilidad de ambas líneas y cada una conserva su número. Puedes elegir chip físico o eSIM. Después del primer pago, cada línea se recarga por separado. Una unidad en el carrito equivale al paquete de dos líneas.",
    topics: ["planes"],
  },
  {
    id: "redes",
    q: "¿Las redes sociales son ilimitadas?",
    a: "En los planes individuales de portabilidad y línea nueva, las redes sociales ilimitadas están sujetas a las condiciones vigentes de Rincel. Los chips de solo datos no son ilimitados: incluyen una bolsa aparte para redes sociales (1 GB o 3 GB según el chip) que no se suma a los GB de navegación.",
    topics: ["planes", "datos"],
  },
  {
    id: "chips-mifi",
    q: "¿Los chips de datos incluyen el MiFi?",
    a: "No. Los chips de solo datos requieren un dispositivo compatible y no incluyen el equipo MiFi, que se vende por separado.",
    topics: ["datos", "mifi"],
  },
  {
    id: "mifi",
    q: "¿Cómo funciona el MiFi Rincel?",
    a: "Es un módem portátil 4G LTE que comparte internet por Wi-Fi. Funciona con servicio prepago mediante recargas de datos y está sujeto a cobertura. No garantizamos una velocidad específica.",
    topics: ["mifi"],
  },
  {
    id: "medios-pago",
    q: "¿Qué medios de pago aceptan?",
    a: "Pagas en el entorno seguro de Mercado Pago. Ahí eliges entre los medios disponibles para tu compra, que pueden incluir tarjeta, transferencia SPEI o efectivo en establecimientos participantes. Nosotros no vemos ni guardamos los datos de tu tarjeta.",
    topics: ["pagos"],
  },
  {
    id: "pago-pendiente",
    q: "Pagué en efectivo o por SPEI, ¿cuándo se confirma mi pedido?",
    a: "Cuando Mercado Pago acredite el pago. Mientras tanto tu pedido aparece como pago en proceso. Respeta la fecha de vencimiento que te indique Mercado Pago en tu referencia.",
    topics: ["pagos"],
  },
  {
    id: "envio",
    q: "¿Cuánto cuesta el envío?",
    a: "Lo calculamos antes de pagar con tu código postal y lo ves en el resumen de tu compra. Si la cotización vence o cambia, te mostramos el nuevo costo antes de cobrar. Las eSIM se entregan de forma digital y no llevan envío.",
    topics: ["envios"],
  },
  {
    id: "consulta",
    q: "¿Cómo consulto mi pedido?",
    a: "Con el enlace privado que te mostramos al terminar tu compra y que enviamos a tu correo. Si lo perdiste, solicítalo en “Consultar mi pedido” con tu número de pedido y el correo que usaste.",
    topics: ["general", "envios"],
  },
  {
    id: "comprobante",
    q: "¿Recibo comprobante de mi compra?",
    a: "Sí. Cuando se aprueba tu pago puedes descargar o imprimir tu comprobante de compra desde tu pedido. Este comprobante no es un CFDI (factura electrónica).",
    topics: ["pagos"],
  },
  {
    id: "kit",
    q: "¿Qué incluye el kit colaborador?",
    a: "Incluye 12 chips Rincel, volantes de apoyo para la venta y soporte o acompañamiento para activar líneas. No incluye saldo, planes activados, ingresos ni comisiones.",
    topics: ["kit"],
  },
];

export function faqFor(topic: FaqItem["topics"][number], limit = 6) {
  return FAQ.filter((f) => f.topics.includes(topic)).slice(0, limit);
}
