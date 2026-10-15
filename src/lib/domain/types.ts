/** Tipos de dominio compartidos entre servidor, base de datos y UI. */

export type UserRole = "admin" | "staff";

export type ProductCategory = "portabilidad" | "linea_nueva" | "datos" | "equipo" | "kit";

/** draft: borrador interno · active: publicado · hidden: oculto sin borrar · archived: retirado */
export type ProductStatus = "draft" | "active" | "hidden" | "archived";

export type SimType = "fisico" | "esim";

/** physical: requiere envío · digital: entrega digital (eSIM), sin envío */
export type DeliveryKind = "physical" | "digital";

export type PaymentStatus =
  | "pending" // pedido creado, sin pago
  | "in_process" // pago en revisión / referencia generada (efectivo, SPEI)
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "refunded"
  | "partially_refunded"
  | "charged_back";

export type FulfillmentStatus = "awaiting_payment" | "pending" | "preparing" | "ready" | "on_hold" | "cancelled" | "not_required";

export type ShippingStatus =
  | "not_required"
  | "awaiting_payment"
  | "pending"
  | "label_created"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "incident"
  | "returned"
  | "cancelled";

export type ActivationStatus = "not_required" | "awaiting_payment" | "pending" | "in_progress" | "activated" | "incident" | "cancelled";

export interface ShippingAddress {
  recipient: string;
  email: string;
  phone: string;
  postalCode: string;
  state: string;
  municipality: string;
  neighborhood: string;
  street: string;
  exteriorNumber: string;
  interiorNumber?: string;
  references?: string;
}

/** Copia inmutable de lo que el cliente vio al comprar. */
export interface OrderItemSnapshot {
  productId: string;
  name: string;
  category: ProductCategory;
  variantCode: string;
  variantLabel: string;
  priceCents: number;
  dataGb: number | null;
  validityDays: number | null;
  socialDataGb: number | null;
  socialUnlimited: boolean;
  linesPerUnit: number;
  features: string[];
  requirements: string[];
  conditions: string[];
  priceNote: string | null;
  capturedAt: string;
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  portabilidad: "Portabilidad",
  linea_nueva: "Línea nueva",
  datos: "Chips solo datos",
  equipo: "Internet portátil",
  kit: "Kit colaborador",
};

export const CATEGORY_SLUGS: Record<ProductCategory, string> = {
  portabilidad: "portabilidad",
  linea_nueva: "linea-nueva",
  datos: "chips-datos",
  equipo: "mifi",
  kit: "kit-colaborador",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendiente de pago",
  in_process: "Pago en proceso",
  approved: "Pagado",
  rejected: "Pago rechazado",
  cancelled: "Cancelado",
  expired: "Vencido",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
  charged_back: "Contracargo",
};

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  awaiting_payment: "En espera de pago",
  pending: "Por preparar",
  preparing: "Preparando",
  ready: "Listo",
  on_hold: "En revisión",
  cancelled: "Cancelado",
  not_required: "No aplica",
};

export const SHIPPING_STATUS_LABELS: Record<ShippingStatus, string> = {
  not_required: "Sin envío (entrega digital)",
  awaiting_payment: "En espera de pago",
  pending: "Preparando envío",
  label_created: "Guía creada",
  picked_up: "Recolectado por paquetería",
  in_transit: "En tránsito",
  delivered: "Entregado",
  incident: "Incidencia en el envío",
  returned: "Devuelto",
  cancelled: "Envío cancelado",
};

export const ACTIVATION_STATUS_LABELS: Record<ActivationStatus, string> = {
  not_required: "No requiere activación",
  awaiting_payment: "En espera de pago",
  pending: "Activación pendiente",
  in_progress: "Activación en proceso",
  activated: "Activada",
  incident: "Incidencia en activación",
  cancelled: "Cancelada",
};
