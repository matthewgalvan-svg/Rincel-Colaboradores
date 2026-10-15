# Marca e imágenes

Los originales entregados están en `assets-rincel/` y **no se modifican**. Los derivados web viven en `public/`.

## Paleta

Transcrita de los códigos escritos en `assets-rincel/marca/paleta-oficial.pdf` (no de capturas): Celeste `#D0E5F6`, Morado `#4D2C85`, Naranja `#F4A61D`, Azul `#1E76BA`, Azul oscuro `#212044`, Turquesa `#4EC2D1`, Blanco. Tokens en `src/app/globals.css`.

## Logo

`public/marca/logo-rincel.svg` (completo) y `logo-rincel-wordmark.svg` (solo “rincel”, versión que también aparece en el PDF de la paleta) se obtuvieron del PDF vectorial:

```bash
pdftocairo -svg assets-rincel/marca/logo-oficial.pdf /tmp/logo.svg
python3 scripts/assets/logo-desde-pdf.py /tmp/logo.svg public/marca/logo-rincel.svg public/marca/logo-rincel-wordmark.svg
```

El script solo recorta el lienzo (viewBox) y separa los trazos existentes; no redibuja ni recolorea. El ícono del sitio (`src/app/icon.svg`) usa el trazo del símbolo de encendido del mismo logo. “Colaboradores” se escribe como texto aparte.

## Rincelito

`npm run images` recorta al contenido y convierte en transparente **solo el fondo blanco conectado a los bordes** de `mascota/rino.png`, con borde suavizado. El personaje (gris, ojos dorados, cuernos marfil, mangas menta, chaleco azul, botones morados y emblema) queda intacto. Se usa sobre superficies claras. `perfiles-rino.png` es solo referencia y no se publica.

## Carteles de producto

- `npm run images` genera WebP de 1254 px y miniaturas de 480 px, sin metadatos y con la proporción original (sin recortes).
- Se muestran completos con opción de ampliar; precio, beneficios y CTA también existen como HTML.
- Si cambian precio o beneficios, el cartel se oculta hasta reemplazarlo o aprobarlo (huella de datos comerciales).
- `mifi-rincel.jpg` está en revisión; se publica `mifi-rincel-sin-texto.png`.
- No se recolorean ni se sustituyen logos impresos en chips, empaques o vestuario.
