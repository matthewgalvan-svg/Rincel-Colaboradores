# Despliegue, respaldos y recuperación

> No publiques ni habilites cobros reales hasta completar esta lista y tener autorización explícita.

## Requisitos

- Node.js ≥ 20.9 (recomendado 22 LTS) y PostgreSQL ≥ 15 con respaldos automáticos.
- Disco persistente para `STORAGE_DIR` (guías, eSIM, imágenes subidas) o un adaptador S3.
- HTTPS obligatorio (cookies seguras en producción).
- Un programador de tareas (cron del hosting) para `POST /api/cron` cada 5–10 minutos.

## Pasos

1. Configura variables de entorno según `.env.example` (`APP_ENV=production`, `APP_URL` con el dominio final, `BETTER_AUTH_SECRET` aleatorio ≥ 32, `CRON_SECRET`).
2. `npm ci && npm run build`.
3. `npm run db:migrate` (antes de arrancar la versión nueva).
4. `npm run db:seed` (solo la primera vez; existencias en 0).
5. Crea la primera cuenta administradora con `npm run admin:create`.
6. `npm start` detrás de un proxy que envíe `X-Forwarded-For` (para límites por IP).
7. En el panel: captura existencias, contacto, envío manual (si aplica) y revisa **Integraciones**.
8. Programa el cron: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron`.

## Checklist de Mercado Pago (sandbox → producción)

1. Crea la aplicación en *Tus integraciones* (producto Checkout Pro) y usa **credenciales de prueba** con `PAYMENT_PROVIDER=mercadopago`, `MP_ENVIRONMENT=sandbox`.
2. Configura la notificación **Webhooks → evento “Order (Mercado Pago)”** con `https://TU-DOMINIO/api/webhooks/mercadopago` y copia la firma secreta a `MP_WEBHOOK_SECRET`.
3. Verifica en sandbox contra la documentación vigente: creación con `type: "online"` y `processing_mode: "manual"`, `checkout_url`, `config.online.*_url`, `expiration_time`, `default_payment_due_date` y la forma de la notificación. Ajusta `src/lib/payments/mercadopago.ts` si la documentación vigente difiere.
4. Prueba con usuarios de prueba: tarjeta aprobada, rechazada, efectivo pendiente y su vencimiento, reembolso total y parcial. Confirma que el panel muestra cada estado.
5. Obtén el **ID de usuario** de la cuenta receptora (`MP_USER_ID`).
6. Producción: credenciales productivas, `MP_ENVIRONMENT=production`, `MP_USER_ID`, y solo con autorización: `PAYMENTS_LIVE_ENABLED=true`. Sin ese candado la app no crea cobros reales.

## Respaldos

- **Base de datos**: respaldos automáticos diarios del proveedor + `pg_dump` diario cifrado fuera del servidor, retención ≥ 30 días:
  `pg_dump --format=custom --no-owner "$DATABASE_URL" > rincel-$(date +%F).dump`
- **Archivos privados** (`STORAGE_DIR`): sincronización diaria cifrada (p. ej. `rclone`/`restic`) con la misma retención.
- Prueba de restauración trimestral en un entorno aislado.

## Recuperación

1. Restaura la base: `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" rincel-AAAA-MM-DD.dump`.
2. Restaura `STORAGE_DIR` del mismo punto.
3. Aplica migraciones pendientes (`npm run db:migrate`).
4. Ejecuta `npm run jobs`: la **conciliación consulta a Mercado Pago** los pedidos abiertos y recupera pagos acreditados durante la caída (los webhooks perdidos no se pierden: el estado real vive en el proveedor).
5. Revisa en el panel pedidos “en revisión” y guías con error.

## Separación de entornos

- `APP_ENV` distinto por entorno y bases de datos distintas.
- Pedidos y eventos de prueba se marcan `is_test` y se excluyen de estadísticas.
- `robots.txt` bloquea todo fuera de producción.

## Seguridad operativa

- Rota `BETTER_AUTH_SECRET` solo con una ventana de mantenimiento (invalida sesiones y enlaces privados de pedidos).
- Nunca compartas tokens por chat; usa el gestor de secretos del hosting.
- Revisa la **Auditoría** y las notificaciones con firma inválida.
