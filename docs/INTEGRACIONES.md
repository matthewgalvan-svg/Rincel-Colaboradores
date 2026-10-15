# Integraciones: reales vs. pendientes

| Integración | Estado | Qué falta |
|---|---|---|
| **Mercado Pago — Checkout Pro vía Orders** | Implementada contra la API documentada (`POST /v1/orders`, `GET /v1/orders/{id}`, `POST /v1/orders/{id}/refund`), firma de webhooks, correlación receptor/importe/moneda, idempotencia y conciliación. Probada con un doble en memoria con la misma forma de respuesta. | Credenciales de **prueba** y validación en sandbox (ver checklist en DESPLIEGUE.md); credenciales de producción, `MP_USER_ID` y `PAYMENTS_LIVE_ENABLED=true` cuando lo autorices. Configurar la URL de notificaciones (tópico Order) en el panel de Mercado Pago. |
| Medios de pago (tarjeta, SPEI, efectivo) | Los elige el comprador dentro de Checkout Pro; el sistema no preselecciona. Pagos pendientes se tratan como pendientes hasta acreditarse. | Confirmar qué medios tiene habilitados la cuenta. No se prometen meses sin intereses ni todos los establecimientos. |
| Pasarela simulada | Solo desarrollo/pruebas. Bloqueada con `APP_ENV=production`. | — |
| **Paquetería** | Interfaz lista (cobertura, cotización, guía, rastreo, cancelación). Disponible: tarifa fija **manual** explícita y **simulada** (solo desarrollo). | Elegir proveedor real e implementar su adaptador con su API oficial; dirección de origen, pesos/medidas y empaque reales. |
| Correo transaccional | SMTP genérico (nodemailer) con bandeja de salida, reintentos y deduplicación. Sin SMTP, los correos quedan “omitidos” (visibles en el panel), no se finge el envío. | Proveedor y remitente (`SMTP_URL`, `EMAIL_FROM`), dominio con SPF/DKIM. |
| Activación de líneas / portabilidad / eSIM | **Manual** por personal autorizado con estados por línea y archivos eSIM privados. | Proceso confirmado por Rincel; API si existe; flujo privado mínimo si se requiere NIP u otros datos. |
| WhatsApp | Enlace `wa.me` configurable desde el panel (oculto si no hay número). | Número definitivo. |
| Google Analytics 4 | Opcional con consentimiento; compra vía Measurement Protocol desde el servidor. | `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`. |
| Meta Pixel / CAPI | Opcional con consentimiento; compra solo desde servidor con `event_id` = pedido; sin correo/teléfono. | `META_PIXEL_ID`, `META_CAPI_TOKEN`; revisar versión de Graph API vigente. |
| Facturación (CFDI) | No implementada. El comprobante dice explícitamente que no es CFDI. | Definir si se facturará y con qué proveedor/PAC; datos fiscales. |
| Almacenamiento de archivos | Disco local (`STORAGE_DIR`) con interfaz aislable. | En hosting sin disco persistente: adaptador S3 compatible. |
| Trabajos programados | `POST /api/cron` (Bearer `CRON_SECRET`) o `npm run jobs`. | Programar cada 5–10 min en el hosting. |
