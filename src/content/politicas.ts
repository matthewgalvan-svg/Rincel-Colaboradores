export interface Policy {
  slug: string;
  title: string;
  description: string;
  sections: { heading: string; paragraphs?: string[]; bullets?: string[] }[];
  /** Puntos que el negocio debe completar o revisar antes de publicar en producción. */
  pending: string[];
}

/**
 * Borradores de políticas. Contienen solo lo que el sistema hace realmente;
 * lo que depende del negocio queda marcado como pendiente de revisión.
 * No se inventan identidad fiscal, garantías ni plazos.
 */
export const POLICIES: Policy[] = [
  {
    slug: "privacidad",
    title: "Aviso de privacidad",
    description: "Cómo tratamos los datos personales que nos compartes al comprar o contactarnos.",
    sections: [
      {
        heading: "Responsable",
        paragraphs: ["Rincel Colaboradores es responsable del tratamiento de los datos personales recabados en este sitio."],
      },
      {
        heading: "Datos que recabamos",
        bullets: [
          "Contacto: nombre, correo electrónico y teléfono.",
          "Entrega: dirección de envío, cuando compras artículos físicos.",
          "Pedido: productos, importes, estado de pago, envío y activación.",
          "Medición propia del sitio con un identificador aleatorio de sesión, sin correo, teléfono ni domicilio.",
        ],
      },
      {
        heading: "Datos que NO recabamos",
        bullets: [
          "No almacenamos datos de tarjetas: los pagos se procesan en el entorno de Mercado Pago.",
          "No pedimos NIP de portabilidad, contraseñas, documentos ni códigos SMS en el carrito.",
        ],
      },
      {
        heading: "Finalidades",
        bullets: ["Procesar y entregar tu pedido.", "Gestionar la activación o portabilidad de líneas.", "Atender dudas, devoluciones, reembolsos e incidencias.", "Cumplir obligaciones legales aplicables."],
      },
      {
        heading: "Transferencias y encargados",
        paragraphs: [
          "Compartimos con proveedores lo estrictamente necesario para operar: Mercado Pago (pagos), la paquetería que entregue tu pedido y el proveedor de correo. Si aceptas la medición opcional, Google Analytics o Meta reciben datos de navegación sin tu correo ni teléfono.",
        ],
      },
      {
        heading: "Derechos ARCO",
        paragraphs: ["Puedes solicitar acceso, rectificación, cancelación u oposición al tratamiento de tus datos escribiéndonos desde la página de contacto."],
      },
    ],
    pending: [
      "Nombre o razón social del responsable, domicilio y medio oficial para solicitudes ARCO.",
      "Plazos de conservación de datos y respuesta a solicitudes.",
      "Revisión legal conforme a la ley mexicana de protección de datos vigente.",
    ],
  },
  {
    slug: "terminos",
    title: "Términos y condiciones",
    description: "Condiciones de compra en la tienda de Rincel Colaboradores.",
    sections: [
      {
        heading: "Quiénes somos",
        paragraphs: ["Rincel Colaboradores comercializa servicios y productos Rincel. Este no es el sitio corporativo oficial de Rincel."],
      },
      {
        heading: "Precios y pagos",
        bullets: [
          "Precios en pesos mexicanos (MXN). El precio que se cobra es el que calcula nuestro sistema al confirmar tu pedido.",
          "Todas las compras son de pago único: no hay suscripciones ni cobros automáticos de recargas.",
          "El pago se realiza en Mercado Pago. Un pedido se confirma solo cuando el pago se acredita.",
          "Los pagos en efectivo o SPEI quedan pendientes hasta su acreditación y vencen en la fecha que indique Mercado Pago.",
        ],
      },
      {
        heading: "Planes, beneficios y vigencias",
        bullets: [
          "Los beneficios de cada plan (GB, vigencia, redes sociales) dependen de las condiciones vigentes de Rincel.",
          "La vigencia de 30 días aplica al pago realizado; no es una promesa de precio para recargas futuras.",
          "Las redes sociales ilimitadas de los planes individuales están sujetas a condiciones. Los chips de solo datos no son ilimitados.",
          "La promoción 2×1 aplica solo en el primer pago y con portabilidad de ambas líneas; después cada línea se recarga por separado.",
        ],
      },
      {
        heading: "Activación y portabilidad",
        paragraphs: [
          "Comprar no activa líneas ni completa la portabilidad de forma automática. Después del pago, nuestro personal te contacta para continuar conforme al proceso de Rincel. Requieres equipo liberado y compatible; para eSIM, equipo compatible con eSIM.",
        ],
      },
    ],
    pending: ["Identidad fiscal del vendedor.", "Jurisdicción, legislación aplicable y medios de resolución de controversias.", "Política de cancelación antes de la activación.", "Revisión legal completa."],
  },
  {
    slug: "envios",
    title: "Política de envíos",
    description: "Cómo cotizamos y entregamos los artículos físicos.",
    sections: [
      {
        heading: "Cotización",
        bullets: [
          "El costo de envío se calcula antes de pagar con tu código postal y se muestra en el resumen.",
          "Cada cotización tiene una vigencia. Si vence o cambia el precio, te mostramos el nuevo costo antes de cobrar.",
          "Las eSIM se entregan de forma digital y no llevan envío.",
        ],
      },
      {
        heading: "Estados del envío",
        bullets: [
          "Preparando: tu pago se acreditó y preparamos el paquete.",
          "Guía creada: generamos la etiqueta; todavía no la recolecta la paquetería.",
          "Recolectado, en tránsito y entregado: según lo que reporte la paquetería.",
          "Incidencia: algo impidió la entrega; te contactaremos.",
        ],
      },
    ],
    pending: ["Paquetería(s) definitivas, cobertura y tiempos estimados.", "Dirección de origen.", "Política para entregas fallidas, direcciones incorrectas y reenvíos."],
  },
  {
    slug: "devoluciones",
    title: "Devoluciones y reembolsos",
    description: "Cómo solicitar una devolución, un reembolso o reportar una incidencia.",
    sections: [
      {
        heading: "Cómo solicitarlo",
        paragraphs: ["Desde tu pedido (enlace privado) envía una solicitud de devolución, reembolso o incidencia. Nuestro equipo la revisa y te responde."],
      },
      {
        heading: "Reembolsos",
        bullets: [
          "Los reembolsos aprobados se procesan a través de Mercado Pago al medio de pago original.",
          "Los tiempos en que el dinero se refleja dependen de Mercado Pago y de tu banco.",
        ],
      },
    ],
    pending: ["Plazos para solicitar devoluciones.", "Condiciones de productos activados, chips usados o eSIM entregadas.", "Costos de envío de devolución.", "Garantía del equipo MiFi (no publicar hasta confirmarla)."],
  },
];
