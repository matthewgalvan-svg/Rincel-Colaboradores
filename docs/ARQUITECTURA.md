# Arquitectura y decisiones

## Propuesta visual

- **Prioridad móvil**, superficies blancas y celestes, texto en azul oscuro `#212044` y morado `#4D2C85`, CTAs naranja `#F4A61D` **con texto azul oscuro** (contraste 7.6:1; el blanco sobre naranja da 2.0:1 y no se usa). Turquesa solo como acento con texto oscuro. Contrastes verificados en `tests/unit/basicos.test.ts`.
- **Logo oficial** extraído como SVG vectorial del PDF (sin redibujar). En el encabezado se usa la palabra “rincel” del propio archivo y “Colaboradores” como descriptor separado; el logo completo con “Internet · Telefonía · Celulares” va en el héroe, pie y comprobantes.
- **Rincelito** (fondo blanco convertido en transparencia por relleno desde los bordes, sin alterar al personaje) aparece en el héroe y como guía del ayudante de elección. No es un widget flotante.
- **Carteles comerciales** completos, sin recortes y ampliables; todo dato (precio, GB, vigencia, condiciones, CTA) también se muestra en HTML accesible.
- Tipografías: Nunito (redondeada, afín al logo) y Barlow Condensed para cifras (eco de los carteles).
- Sin reseñas ficticias, contadores, escasez falsa ni etiquetas “Más vendido”.

## Capas

```
Navegador ──► Páginas (RSC) ──► src/lib/* (dominio, solo servidor) ──► PostgreSQL
    │                                 │
    └─► /api/* (JSON, mismo origen)    ├─► PaymentGateway  (mercadopago | simulated)
                                      ├─► ShippingProvider (manual | simulated | futuro real)
                                      └─► Notificaciones (SMTP opcional, bandeja con reintentos)
```

- Todo cálculo de precios, existencias y totales ocurre en el servidor (`src/lib/cart/pricing.ts`). El navegador solo envía qué y cuánto.
- Los secretos viven en variables de entorno (`src/lib/env.ts`), nunca con prefijo `NEXT_PUBLIC_`.
- `server-only` impide importar módulos de dominio desde componentes cliente.

## Modelo de datos (resumen)

| Tabla | Propósito |
|---|---|
| `products`, `product_variants` | Catálogo; variantes por modalidad (chip físico / eSIM / único). `internal_pending` nunca se envía al navegador. |
| `inventory_components`, `variant_components` | Inventario por componente: 2×1 físico = 2 `sim-rincel`; kit = 12 `sim-rincel` + 1 `volantes-kit`; eSIM = sin componentes. |
| `inventory_reservations`, `inventory_movements` | Apartados con vencimiento y salidas idempotentes (índice único por pedido/componente). |
| `orders`, `order_items`, `order_events` | Pedido con número `RC-AAMM-XXXXX`, **estados independientes** (pago, preparación, envío, activación) y copia (snapshot) de productos/condiciones al comprar. |
| `payments`, `webhook_events`, `refunds` | Transacciones del proveedor, notificaciones deduplicadas por `x-request-id`, reembolsos con llave de idempotencia. |
| `shipping_quotes`, `shipments`, `shipment_events` | Cotización con costo/ID/vigencia ligada al carrito y CP; una guía por envío (índice único + candado). |
| `activations`, `files` | Activación manual por línea; archivos eSIM/guías privados fuera de `public/`. |
| `receipts`, `notifications` | Comprobante único por pedido; bandeja de correos con deduplicación. |
| `analytics_events` | Medición propia sin PII; `purchase` único por pedido (índice parcial). |
| `audit_log`, `settings`, `rate_limits`, `auth_*` | Auditoría, configuración editable, límites de frecuencia y autenticación. |

## Flujo de compra y pago

1. **Carrito** (localStorage como almacén externo) → `/api/carrito` valora con precios y existencias del servidor.
2. **Cotización** (`/api/envios/cotizar`) para artículos físicos: guarda servicio, costo, ID y vigencia, ligados a la huella del carrito y al CP.
3. **Checkout** (`/api/checkout` → `createOrderAndCheckout`): valida datos (Zod), revalida cotización, compara el total con el que vio el cliente (si cambió, pide confirmación), crea el pedido pendiente con número único y **aparta inventario dentro de una transacción con bloqueo de filas**. La `checkoutKey` del formulario evita pedidos duplicados por doble envío.
4. **Sesión de pago**: `POST /v1/orders` (`type: online`, `processing_mode: manual`, `X-Idempotency-Key`, `external_reference` = número de pedido, artículos + envío que suman exactamente el total) → `checkout_url`. El medio de pago se elige en Mercado Pago (no se preselecciona).
5. **Confirmación**: el webhook (tópico `order`) se valida con HMAC-SHA256 (`id:[data.id];request-id:[x-request-id];ts:[ts];`, `data.id` en minúsculas), se deduplica y **siempre se consulta el estado real** con `GET /v1/orders/{id}`. Antes de aprobar se correlacionan referencia, **cuenta receptora** (`MP_USER_ID`), importe y moneda; cualquier diferencia deja el pedido **en revisión** sin aprobar.
6. **Al aprobarse** (una sola vez): salida de inventario (o revisión si un pago tardío ya no tiene existencias), comprobante, envío y activaciones pendientes, correo y evento `purchase` único. Los parámetros de retorno nunca aprueban nada: la página de resultado consulta al proveedor desde el servidor.
7. **Pendientes (efectivo/SPEI)** quedan “en proceso”; el apartado se extiende hasta la fecha de vencimiento del proveedor (máximo configurable).
8. **Conciliación** (`npm run jobs` o `POST /api/cron`): recupera webhooks perdidos, vence pedidos sin pago y libera inventario, reintenta guías y correos.

Transiciones defendidas: notificaciones duplicadas o fuera de orden no revierten un pago aprobado; `cancelled/expired` sobre un pedido pagado → revisión; contracargo → revisión y envío detenido; pago aprobado en pedido cancelado → revisión.

## Envíos

`ShippingProvider` define cobertura, cotización, creación de guía, rastreo y cancelación. Hoy existen:
- `manual`: tarifa fija **explícitamente configurada** por el negocio (no finge cotizar); la guía se captura en el panel.
- `simulated`: tarifas y guías marcadas “SIMULADO / SIN VALIDEZ”, **bloqueado en producción**.

Sin proveedor configurado, el checkout bloquea la compra de artículos físicos. La guía se crea solo con pago aprobado, sin anomalías y con envío pendiente; un candado temporal + índice único garantizan una guía por envío; si falla, el pago se conserva, se registra el error y se reintenta.

## Seguridad

- Autenticación del panel con Better Auth: registro público deshabilitado, contraseñas ≥ 12, sesiones de 12 h, límite de 5 intentos / 5 min por IP en PostgreSQL. Permisos por rol verificados en servidor (`src/lib/auth/guard.ts`) en cada página, acción y ruta.
- Pedidos de clientes: acceso solo con **token HMAC** derivado de una sal por pedido + secreto del servidor (el número solo no muestra datos; responde igual que un pedido inexistente).
- CSRF: rutas JSON exigen mismo origen; acciones de servidor de Next verifican origen.
- Límites de frecuencia en checkout, cotización, contacto, solicitud de enlace, comprobantes y eventos.
- Encabezados: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, y `noindex` + `no-store` en checkout, carrito, pedidos y panel.
- Archivos: detección de tipo por firma, 8 MB máx., nombres aleatorios, fuera de `public/`, descargas auditadas.
- Exportación CSV protegida contra inyección de fórmulas; logs sin secretos.

## Analítica

Eventos propios: `page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `shipping_quote(_error)`, `cta_click`, `whatsapp_click` (navegador) y `payment_started`, `purchase`, `refund` (servidor). `purchase` solo se registra al aprobarse el pago, una vez por pedido; el navegador no puede enviarlo. GA4 (Measurement Protocol) y Meta (Pixel/CAPI) son opcionales, con consentimiento, y reciben la compra solo desde el servidor con `transaction_id`/`event_id` = número de pedido. Ninguna integración recibe correo, teléfono ni domicilio.

## Por qué Orders y no Preferences

Mercado Pago recomienda la API de Orders para integraciones nuevas de Checkout Pro. Se implementó con la forma documentada (y con los tipos del SDK oficial `mercadopago@3.6`). El adaptador está aislado en `src/lib/payments/mercadopago.ts`; antes de producción se valida en sandbox (ver [DESPLIEGUE.md](DESPLIEGUE.md)).
