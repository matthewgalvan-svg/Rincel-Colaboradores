import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ActivationStatus,
  FulfillmentStatus,
  PaymentStatus,
  ProductCategory,
  ProductStatus,
  ShippingAddress,
  ShippingStatus,
  SimType,
  DeliveryKind,
  OrderItemSnapshot,
  UserRole,
} from "@/lib/domain/types";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* -------------------------------------------------------------------------- */
/* Autenticación (Better Auth). Los nombres de propiedad deben coincidir con  */
/* los campos que espera Better Auth; los nombres SQL son snake_case.         */
/* -------------------------------------------------------------------------- */

export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").$type<UserRole>(),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: ts("ban_expires"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("auth_session_user_idx").on(t.userId)],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_account_user_idx").on(t.userId)],
);

export const authVerification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);

export const authRateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* -------------------------------------------------------------------------- */
/* Catálogo                                                                   */
/* -------------------------------------------------------------------------- */

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(), // slug estable, p. ej. rino-150-portabilidad
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    category: text("category").$type<ProductCategory>().notNull(),
    status: text("status").$type<ProductStatus>().notNull().default("draft"),
    /** Si es false, el producto puede mostrarse pero no cobrarse (falta confirmar datos). */
    chargeable: boolean("chargeable").notNull().default(false),
    priceCents: integer("price_cents").notNull(),
    /** GB de navegación. null = pendiente o no aplica (no significa cero). */
    dataGb: numeric("data_gb", { precision: 8, scale: 2, mode: "number" }),
    validityDays: integer("validity_days"),
    /** Bolsa de redes sociales en GB (chips solo datos). */
    socialDataGb: numeric("social_data_gb", { precision: 8, scale: 2, mode: "number" }),
    /** Redes sociales ilimitadas sujetas a condiciones de Rincel. */
    socialUnlimited: boolean("social_unlimited").notNull().default(false),
    /** Líneas que representa una unidad del carrito (2×1 = 2). */
    linesPerUnit: integer("lines_per_unit").notNull().default(0),
    tagline: text("tagline").notNull().default(""),
    description: text("description").notNull().default(""),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    requirements: jsonb("requirements").$type<string[]>().notNull().default([]),
    conditions: jsonb("conditions").$type<string[]>().notNull().default([]),
    /** Nota destacada junto al precio y CTA (p. ej. condiciones 2×1). */
    priceNote: text("price_note"),
    ctaLabel: text("cta_label").notNull().default("Elegir este plan"),
    /** Pendientes internos: nunca se envían al navegador público. */
    internalPending: jsonb("internal_pending").$type<string[]>().notNull().default([]),
    imagePath: text("image_path"),
    imageAlt: text("image_alt").notNull().default(""),
    /** Huella de precio/beneficios con la que se validó la imagen comercial. */
    imageFactsHash: text("image_facts_hash"),
    /** Si es true, la imagen comercial no se publica hasta revisión. */
    imageReviewRequired: boolean("image_review_required").notNull().default(false),
    /** Imagen alterna sin afirmaciones (p. ej. MiFi sin texto). */
    altImagePath: text("alt_image_path"),
    altImageAlt: text("alt_image_alt"),
    sortOrder: integer("sort_order").notNull().default(0),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_category_idx").on(t.category, t.sortOrder)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey(), // p. ej. rino-230-portabilidad-2x1:esim
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // fisico | esim | unico
    label: text("label").notNull(),
    simType: text("sim_type").$type<SimType | null>(),
    delivery: text("delivery").$type<DeliveryKind>().notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("product_variants_product_code_uq").on(t.productId, t.code)],
);

/* -------------------------------------------------------------------------- */
/* Inventario por componentes                                                 */
/* -------------------------------------------------------------------------- */

export const inventoryComponents = pgTable("inventory_components", {
  id: text("id").primaryKey(), // sim-rincel, sim-datos, mifi-satco-f02, volantes-kit
  name: text("name").notNull(),
  onHand: integer("on_hand").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  /** Peso y medidas reales por unidad para cotizar envíos (null = por configurar). */
  weightGrams: integer("weight_grams"),
  lengthCm: integer("length_cm"),
  widthCm: integer("width_cm"),
  heightCm: integer("height_cm"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const variantComponents = pgTable(
  "variant_components",
  {
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    componentId: text("component_id")
      .notNull()
      .references(() => inventoryComponents.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.componentId] })],
);

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    componentId: text("component_id")
      .notNull()
      .references(() => inventoryComponents.id),
    quantity: integer("quantity").notNull(),
    /** active | committed | released | expired */
    status: text("status").$type<"active" | "committed" | "released" | "expired">().notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inventory_reservations_component_status_idx").on(t.componentId, t.status),
    index("inventory_reservations_order_idx").on(t.orderId),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    componentId: text("component_id")
      .notNull()
      .references(() => inventoryComponents.id),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(), // ajuste | venta | devolucion | correccion
    orderId: uuid("order_id"),
    userId: text("user_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_movements_component_idx").on(t.componentId, t.createdAt),
    uniqueIndex("inventory_movements_sale_uq")
      .on(t.componentId, t.orderId, t.reason)
      .where(sql`${t.reason} = 'venta'`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Configuración editable                                                     */
/* -------------------------------------------------------------------------- */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: updatedAt(),
});

/* -------------------------------------------------------------------------- */
/* Pedidos                                                                    */
/* -------------------------------------------------------------------------- */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    /**
     * Sal aleatoria del enlace privado de consulta. El token se deriva con
     * HMAC(secreto del servidor, pedido + sal): no se guarda en claro y una
     * fuga de la base no basta para consultar pedidos.
     */
    accessSalt: text("access_salt").notNull(),
    /** Llave de idempotencia enviada por el checkout para evitar pedidos duplicados. */
    checkoutKey: text("checkout_key").notNull().unique(),
    customerName: text("customer_name").notNull(),
    email: text("email").notNull(),
    /** Hash del correo normalizado para métricas de nuevos/recurrentes sin PII. */
    emailHash: text("email_hash").notNull(),
    phone: text("phone").notNull(),
    shippingAddress: jsonb("shipping_address").$type<ShippingAddress | null>(),
    requiresShipping: boolean("requires_shipping").notNull(),
    hasDigital: boolean("has_digital").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("MXN"),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull(),
    fulfillmentStatus: text("fulfillment_status").$type<FulfillmentStatus>().notNull(),
    shippingStatus: text("shipping_status").$type<ShippingStatus>().notNull(),
    activationStatus: text("activation_status").$type<ActivationStatus>().notNull(),
    reviewRequired: boolean("review_required").notNull().default(false),
    reviewReason: text("review_reason"),
    paymentProvider: text("payment_provider").notNull(),
    /** sandbox | production | simulated */
    paymentEnvironment: text("payment_environment").notNull(),
    isTest: boolean("is_test").notNull().default(false),
    providerOrderId: text("provider_order_id").unique(),
    checkoutUrl: text("checkout_url"),
    shippingQuoteId: uuid("shipping_quote_id"),
    shippingMethodLabel: text("shipping_method_label"),
    reservationExpiresAt: ts("reservation_expires_at"),
    paidAt: ts("paid_at"),
    cancelledAt: ts("cancelled_at"),
    assignedTo: text("assigned_to"),
    termsAcceptedAt: ts("terms_accepted_at").notNull(),
    analyticsConsent: boolean("analytics_consent").notNull().default(false),
    analyticsSessionId: text("analytics_session_id"),
    attribution: jsonb("attribution").$type<Record<string, string>>().notNull().default({}),
    deviceType: text("device_type"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_created_idx").on(t.createdAt),
    index("orders_payment_status_idx").on(t.paymentStatus),
    index("orders_email_hash_idx").on(t.emailHash),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    variantId: text("variant_id").notNull(),
    productName: text("product_name").notNull(),
    variantLabel: text("variant_label").notNull(),
    category: text("category").$type<ProductCategory>().notNull(),
    delivery: text("delivery").$type<DeliveryKind>().notNull(),
    simType: text("sim_type").$type<SimType | null>(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    linesPerUnit: integer("lines_per_unit").notNull(),
    snapshot: jsonb("snapshot").$type<OrderItemSnapshot>().notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    visibleToCustomer: boolean("visible_to_customer").notNull().default(false),
    actorUserId: text("actor_user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Pagos                                                                      */
/* -------------------------------------------------------------------------- */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id").notNull(),
    status: text("status").$type<PaymentStatus>().notNull(),
    rawStatus: text("raw_status"),
    rawStatusDetail: text("raw_status_detail"),
    amountCents: integer("amount_cents").notNull(),
    paidAmountCents: integer("paid_amount_cents"),
    refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
    currency: text("currency"),
    paymentMethodId: text("payment_method_id"),
    paymentType: text("payment_type"),
    receiverId: text("receiver_id"),
    liveMode: boolean("live_mode"),
    dateOfExpiration: ts("date_of_expiration"),
    approvedAt: ts("approved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_payment_uq").on(t.provider, t.providerPaymentId),
    index("payments_order_idx").on(t.orderId),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    requestId: text("request_id"),
    topic: text("topic"),
    action: text("action"),
    resourceId: text("resource_id"),
    signatureValid: boolean("signature_valid").notNull(),
    liveMode: boolean("live_mode"),
    /** received | processed | ignored | rejected | failed */
    status: text("status").notNull(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [
    uniqueIndex("webhook_events_request_uq")
      .on(t.provider, t.requestId)
      .where(sql`${t.requestId} is not null`),
    index("webhook_events_received_idx").on(t.receivedAt),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    /** requested | processing | approved | rejected | failed */
    status: text("status").notNull(),
    providerRefundId: text("provider_refund_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    requestedBy: text("requested_by").notNull(),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("refunds_order_idx").on(t.orderId)],
);

/* -------------------------------------------------------------------------- */
/* Envíos                                                                     */
/* -------------------------------------------------------------------------- */

export const shippingQuotes = pgTable("shipping_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  serviceCode: text("service_code").notNull(),
  serviceName: text("service_name").notNull(),
  carrier: text("carrier"),
  costCents: integer("cost_cents").notNull(),
  currency: text("currency").notNull().default("MXN"),
  postalCode: text("postal_code").notNull(),
  /** Huella de los artículos físicos cotizados (cambia si cambia el carrito). */
  cartHash: text("cart_hash").notNull(),
  providerQuoteId: text("provider_quote_id"),
  estimatedDays: text("estimated_days"),
  isSimulated: boolean("is_simulated").notNull().default(false),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  quoteId: uuid("quote_id"),
  provider: text("provider").notNull(),
  serviceCode: text("service_code"),
  serviceName: text("service_name"),
  costCents: integer("cost_cents").notNull(),
  status: text("status").$type<ShippingStatus>().notNull(),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  labelFileId: uuid("label_file_id"),
  providerShipmentId: text("provider_shipment_id"),
  /** Garantiza una sola guía por envío. */
  labelIdempotencyKey: text("label_idempotency_key").notNull().unique(),
  labelAttempts: integer("label_attempts").notNull().default(0),
  /** Candado temporal mientras se solicita la guía al proveedor. */
  labelLockedUntil: ts("label_locked_until"),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    status: text("status").$type<ShippingStatus>().notNull(),
    description: text("description").notNull(),
    source: text("source").notNull(), // proveedor | manual | sistema
    providerEventId: text("provider_event_id"),
    occurredAt: ts("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("shipment_events_shipment_idx").on(t.shipmentId, t.occurredAt),
    uniqueIndex("shipment_events_provider_uq")
      .on(t.shipmentId, t.providerEventId)
      .where(sql`${t.providerEventId} is not null`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Activaciones (gestión manual segura)                                       */
/* -------------------------------------------------------------------------- */

export const activations = pgTable(
  "activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    lineIndex: integer("line_index").notNull(),
    kind: text("kind").notNull(), // portabilidad | linea_nueva | datos
    simType: text("sim_type").$type<SimType>().notNull(),
    status: text("status").$type<ActivationStatus>().notNull(),
    assignedTo: text("assigned_to"),
    esimFileId: uuid("esim_file_id"),
    esimAvailableToCustomer: boolean("esim_available_to_customer").notNull().default(false),
    internalNote: text("internal_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("activations_item_line_uq").on(t.orderItemId, t.lineIndex),
    index("activations_status_idx").on(t.status),
  ],
);

/* -------------------------------------------------------------------------- */
/* Archivos privados (guías, eSIM) y públicos (imágenes de producto)          */
/* -------------------------------------------------------------------------- */

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(), // guia | esim | producto
  storageKey: text("storage_key").notNull().unique(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  isPrivate: boolean("is_private").notNull().default(true),
  orderId: uuid("order_id"),
  uploadedBy: text("uploaded_by"),
  createdAt: createdAt(),
});

/* -------------------------------------------------------------------------- */
/* Comprobantes y notificaciones                                              */
/* -------------------------------------------------------------------------- */

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  number: text("number").notNull().unique(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  issuedAt: ts("issued_at").notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // email
    template: text("template").notNull(),
    recipient: text("recipient").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** pending | sent | skipped | failed */
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    dedupKey: text("dedup_key").notNull().unique(),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("notifications_status_idx").on(t.status)],
);

/* -------------------------------------------------------------------------- */
/* Solicitudes de clientes (contacto, devoluciones, incidencias)              */
/* -------------------------------------------------------------------------- */

export const supportRequests = pgTable(
  "support_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    type: text("type").notNull(), // contacto | devolucion | reembolso | incidencia
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    message: text("message").notNull(),
    status: text("status").notNull().default("abierta"), // abierta | en_revision | resuelta | rechazada
    assignedTo: text("assigned_to"),
    resolution: text("resolution"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("support_requests_status_idx").on(t.status, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Analítica propia (sin correo, teléfono ni domicilio)                       */
/* -------------------------------------------------------------------------- */

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    sessionId: text("session_id"),
    orderId: uuid("order_id"),
    productId: text("product_id"),
    ctaId: text("cta_id"),
    path: text("path"),
    valueCents: integer("value_cents"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    referrerHost: text("referrer_host"),
    device: text("device"),
    isTest: boolean("is_test").notNull().default(false),
    meta: jsonb("meta").$type<Record<string, string | number | boolean>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("analytics_events_name_created_idx").on(t.name, t.createdAt),
    index("analytics_events_session_idx").on(t.sessionId),
    uniqueIndex("analytics_events_purchase_uq")
      .on(t.orderId)
      .where(sql`${t.name} = 'purchase'`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Auditoría y límites de frecuencia                                          */
/* -------------------------------------------------------------------------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: text("actor_user_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId), index("audit_log_created_idx").on(t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Pasarela simulada (solo desarrollo/pruebas; nunca se usa en producción)    */
/* -------------------------------------------------------------------------- */

export const simulatedProviderOrders = pgTable("simulated_provider_orders", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  externalReference: text("external_reference").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: text("status").notNull(),
  statusDetail: text("status_detail"),
  refundedCents: integer("refunded_cents").notNull().default(0),
  paymentMethodId: text("payment_method_id"),
  paymentType: text("payment_type"),
  /** Para probar correlación: importe, moneda o receptor alterados. */
  overrideAmountCents: integer("override_amount_cents"),
  overrideCurrency: text("override_currency"),
  overrideReceiverId: text("override_receiver_id"),
  returnUrls: jsonb("return_urls").$type<{ success: string; failure: string; pending: string }>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: ts("reset_at").notNull(),
});
