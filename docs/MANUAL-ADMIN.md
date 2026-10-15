# Manual administrativo

Panel: `https://TU-DOMINIO/admin`. Solo personal autorizado; no hay registro público.

## Roles

| Puede… | Administrador | Personal de pedidos |
|---|:-:|:-:|
| Ver y operar pedidos, envíos, activaciones y solicitudes | ✔ | ✔ |
| Ver estadísticas | ✔ | ✔ |
| Solicitar reembolsos | ✔ | ✔ |
| **Ejecutar** reembolsos reales, cancelar pedidos, resolver anomalías | ✔ | ✘ |
| Precios, productos, imágenes, inventario, configuración | ✔ | ✘ |
| Usuarios, auditoría, exportar CSV | ✔ | ✘ |

Crear la primera cuenta: `ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD='…' ADMIN_ROLE=admin npm run admin:create`. Después, un administrador crea las demás en **Usuarios** (contraseña temporal ≥ 12 caracteres, compartida por canal seguro). Desactivar una cuenta cierra sus sesiones.

## Tablero

Muestra cobro de 7 días (facturación, **no ganancia**) y alertas: pedidos con anomalía, pagados por preparar, guías con error, activaciones pendientes, solicitudes abiertas, correos no enviados, notificaciones de pago rechazadas, existencias bajas y carteles por revisar.

## Pedidos

Cada pedido tiene **cuatro estados independientes**:

- **Pago**: pendiente → en proceso (efectivo/SPEI) → pagado; o rechazado / vencido / cancelado / reembolsado / contracargo. Lo decide Mercado Pago; usa “Consultar al proveedor” si dudas. **Nunca marques un pedido como pagado por una captura de pantalla.**
- **Preparación**: por preparar → preparando → listo (o detenido).
- **Envío**: preparando envío → guía creada → recolectado → en tránsito → entregado (o incidencia/devuelto). “Guía creada” **no** significa “recolectado”.
- **Activación** (por línea): pendiente → en proceso → activada (o incidencia/cancelada).

### Anomalías (revisión)

Un pedido entra en revisión si el importe, la moneda o la cuenta receptora no coinciden, si se pagó sin existencias (pago tardío), si se pagó un pedido cancelado o hay contracargo. Mientras esté en revisión **no se puede preparar, generar guía ni activar**. Un administrador investiga y la resuelve escribiendo qué se decidió (p. ej. reembolso o reposición de existencias).

### Envíos y guías

- Con un proveedor que crea guías, usa “Crear guía”. Solo se crea una por envío; si falla, el pago se conserva y puedes reintentar o capturarla manualmente.
- Guía manual: paquetería, número, enlace de rastreo (https) y PDF opcional (privado).
- Registra cada avance con lo que reporte la paquetería; el cliente recibe un correo (si hay SMTP).
- No envíes pedidos sin pago, cancelados o con anomalía: el sistema lo bloquea.

### Activaciones (gestión manual)

No hay API de activación conectada. Comprar no activa líneas.
1. Contacta al cliente por el teléfono/correo del pedido. **No pidas NIP, contraseñas ni códigos por canales abiertos**; sigue el proceso confirmado por Rincel.
2. Cambia el estado de cada línea y asigna responsable; deja notas internas.
3. **eSIM**: carga el archivo (PDF/imagen; queda privado) y, ya validado, “Liberar al cliente”: lo descarga desde su enlace privado (cada descarga queda registrada). No generes QR ficticios.

### Reembolsos

1. Personal o administrador: “Solicitar reembolso” (importe y motivo).
2. Administrador: “Ejecutar reembolso en el proveedor” → se envía la operación real a Mercado Pago con llave de idempotencia. Marca “Regresar existencias” solo en reembolsos totales con mercancía devuelta (los parciales se ajustan en Inventario).
3. El estado de pago se actualiza consultando al proveedor.

### Cancelar

Solo pedidos **sin pago acreditado** (libera el inventario apartado). Para pedidos pagados usa reembolso.

### Exportar

“Exportar CSV” (administrador) respeta los filtros. Contiene datos personales: trátalo conforme al aviso de privacidad.

## Productos

- Edita nombre, precio (es el que se cobra), GB, vigencia, bolsa de redes, textos públicos, condiciones y **pendientes internos** (nunca se publican).
- **Borrador**: no visible. **Cobro deshabilitado**: visible pero sin botón de compra (para productos que requieren confirmación).
- **Carteles desactualizados**: si cambias precio o un beneficio impreso, el cartel deja de mostrarse automáticamente. Sube uno nuevo (confirmando que muestra los datos vigentes) o, si verificaste que sigue siendo correcto, apruébalo.
- **MiFi**: el cartel original dice “hasta 10 dispositivos” y está **en revisión**; se publica la imagen sin texto. Apruébalo solo cuando se confirme el dato.
- Producto 14: créalo como borrador cuando esté definido.

## Inventario

Existencias por componente (chip de línea, chip de datos, MiFi, volantes). **Disponible = en almacén − apartado**. Los apartados vencen si no se acredita el pago. Ajustes siempre con motivo (quedan auditados). Configura pesos y medidas reales si conectarás una paquetería. En “Componentes por variante” se define cuánto consume cada producto (2×1 = 2 chips; kit = 12 chips + volantes). Inicialmente producción arranca en **0**: captura las existencias reales.

## Configuración

Contacto (WhatsApp solo si lo configuras), textos del inicio, aviso superior (sin urgencias falsas), envío manual (tarifa fija explícita), creación automática de guías, vigencias de cotización y apartado, dirección de origen. El bloque **Integraciones** muestra si pagos, firma de webhooks, cuenta receptora, envíos, correo, analítica y trabajos programados están configurados — sin mostrar secretos. “Ejecutar conciliación ahora” corre los trabajos periódicos.

## Estadísticas

Filtra por fechas y compara con el periodo anterior. Definiciones:
- **Ventas cobradas**: suma de pedidos con pago acreditado en el periodo (no es utilidad).
- **Conversión**: pedidos pagados / sesiones (sesión = identificador aleatorio; 30 min de inactividad = nueva).
- **Abandono de checkout**: sesiones que iniciaron checkout sin compra pagada en el periodo. **Abandono de carrito**: agregaron al carrito sin iniciar checkout.
- Utilidad y ROAS: “Sin datos” hasta registrar costos, comisiones, envíos e inversión real.
- Los datos de prueba se excluyen salvo que marques “Incluir datos de prueba”.

## Auditoría

Registro de cambios de productos, inventario, configuración, usuarios, reembolsos, envíos, activaciones, descargas de archivos privados y exportaciones.
