# Rincel Colaboradores — Tienda en línea

Tienda funcional de **Rincel Colaboradores**: planes con portabilidad, líneas nuevas, promoción 2×1, chips de solo datos, MiFi y kit colaborador. Incluye catálogo, comparador, carrito persistente, checkout de invitado con cotización de envío previa, pagos con **Mercado Pago Checkout Pro (vía Orders)**, pedidos con estados independientes, comprobantes, seguimiento, panel administrativo con roles, inventario por componentes, estadísticas y auditoría.

> **Estado:** listo para pruebas con datos y pasarela **simulados** o con credenciales **de prueba** de Mercado Pago. **No hay cobros reales habilitados**: requieren configuración y un candado explícito (`PAYMENTS_LIVE_ENABLED=true`). Revisa [docs/PENDIENTES.md](docs/PENDIENTES.md) antes de publicar.

## Tecnología

| Pieza | Elección |
|---|---|
| App | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5.9 |
| Estilos | Tailwind CSS 4 con la paleta oficial como tokens |
| Base de datos | PostgreSQL + Drizzle ORM (migraciones SQL versionadas en `drizzle/`) |
| Autenticación | Better Auth (correo + contraseña, roles `admin` / `staff`, sesiones en BD, límite de intentos) |
| Pagos | Mercado Pago Orders API (`type: online`) detrás de una interfaz intercambiable |
| Envíos | Adaptador intercambiable: `manual` (tarifa fija explícita) o `simulated` (solo desarrollo) |
| Comprobantes | PDF con `pdf-lib` y el logo vectorial original |
| Pruebas | Vitest (unidad + integración con PostgreSQL real) y Playwright (móvil y escritorio) |

Decisiones y diagramas de flujo: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Puesta en marcha (desarrollo)

Requisitos: Node.js ≥ 20.9 (probado con 22) y PostgreSQL ≥ 15.

```bash
npm install
cp .env.example .env            # completa DATABASE_URL y BETTER_AUTH_SECRET
npm run db:migrate              # crea las tablas
npm run db:seed -- --dev-stock  # 13 productos + existencias DE PRUEBA (100 por componente)
ADMIN_EMAIL=tu@correo.mx ADMIN_NAME="Tu nombre" ADMIN_PASSWORD='contraseña-larga-segura' ADMIN_ROLE=admin npm run admin:create
npm run dev                     # http://localhost:3000  ·  panel: /admin
```

Con `PAYMENT_PROVIDER=simulated` y `SHIPPING_PROVIDER=simulated` puedes recorrer todo el flujo: el botón “Pagar con Mercado Pago” lleva a una **pasarela simulada** (solo desarrollo) donde eliges aprobar, rechazar o dejar pendiente en efectivo/SPEI. La app bloquea los modos simulados cuando `APP_ENV=production`.

### Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo, compilación y servidor de producción |
| `npm run db:generate` | Genera una migración a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica migraciones a `DATABASE_URL` |
| `npm run db:seed` | Carga el catálogo base (no pisa cambios hechos en el panel; `--overwrite` para forzar) |
| `npm run admin:create` | Crea una cuenta del panel (variables `ADMIN_*`) |
| `npm run jobs` | Ejecuta una vez vencimientos, conciliación de pagos, guías y correos |
| `npm run images` | Regenera derivados web desde `assets-rincel/` (no modifica originales) |
| `npm run lint` / `typecheck` | ESLint y TypeScript |
| `npm test` | Vitest (requiere la base `rincel_vitest`, ver abajo) |
| `npm run test:e2e` | Playwright (requiere la base `rincel_test` migrada y con catálogo) |

## Pruebas

```bash
# Bases de prueba (una sola vez)
createdb rincel_vitest && createdb rincel_test
DATABASE_URL=postgres://…/rincel_test APP_ENV=test npm run db:migrate
DATABASE_URL=postgres://…/rincel_test APP_ENV=test npm run db:seed -- --dev-stock

npm test                 # 46 pruebas: recrea el esquema de rincel_vitest en cada corrida
npm run test:e2e         # 16 pruebas en móvil (Pixel 7) y escritorio
# Si Chromium está preinstalado en otra ruta: PLAYWRIGHT_CHROMIUM_PATH=/ruta/chrome npm run test:e2e
```

Cobertura de los escenarios pedidos: pago aprobado / rechazado / pendiente (efectivo/SPEI), webhook duplicado y firma inválida, importe, moneda o cuenta receptora incorrectos, notificaciones fuera de orden y de otro entorno, conciliación de un webhook perdido, manipulación de precios, `checkoutKey` idempotente, stock concurrente, 2×1 (2 chips / 2 eSIM), kit (12 chips), eSIM solo en 2×1, digital sin envío, mixto con cotización, cotización vencida / de otro carrito / sin cobertura / error del proveedor, guía duplicada y fallida con reintento, pago tardío sin existencias, bloqueos por anomalía, permisos por rol y acceso indebido a pedidos, comprobantes, deduplicación de `purchase`, reembolso real con devolución de existencias, contraste de la paleta y coincidencia del catálogo con `catalogo-base.json`.

## Estructura

```
assets-rincel/        Originales entregados (logo/paleta PDF, mascota, carteles) + catalogo-base.json y manifiesto (sin rutas locales)
public/               Derivados web: logo SVG extraído del PDF, Rincelito sin fondo, carteles WebP
drizzle/              Migraciones SQL
scripts/              migrate, seed, create-admin, jobs, build-images
src/app/(tienda)/     Tienda pública
src/app/admin/        Panel (acceso + secciones protegidas)
src/app/api/          Checkout, cotización, webhooks, comprobantes, eventos, cron, archivos
src/lib/              Dominio: catálogo, carrito, inventario, pagos, envíos, pedidos, analítica, auditoría
tests/                unit, integration (Vitest) y e2e (Playwright)
docs/                 Arquitectura, manual administrativo, integraciones, despliegue, pendientes, assets
```

## Documentación

- [Arquitectura y decisiones](docs/ARQUITECTURA.md)
- [Manual administrativo](docs/MANUAL-ADMIN.md)
- [Integraciones reales vs. pendientes](docs/INTEGRACIONES.md)
- [Despliegue, respaldos y recuperación](docs/DESPLIEGUE.md)
- [Pendientes y preguntas al negocio](docs/PENDIENTES.md)
- [Tratamiento de marca e imágenes](docs/ASSETS.md)
