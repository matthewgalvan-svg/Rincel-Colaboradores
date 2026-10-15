/**
 * Genera derivados web optimizados a partir de los originales de
 * `assets-rincel/` sin modificarlos. Los derivados se guardan en `public/`.
 *
 *   npm run images
 *
 * - Productos: WebP 1254 px (cuadrado), sin metadatos, misma proporción, sin recortes.
 * - Mascota: recorte al contenido y fondo blanco convertido en transparencia
 *   mediante relleno desde los bordes (no se altera el personaje).
 * - Logo: los SVG se derivan del PDF vectorial (ver docs/ASSETS.md).
 */
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "assets-rincel");
const OUT = path.join(ROOT, "public");

async function products() {
  const dir = path.join(SRC, "productos");
  const outDir = path.join(OUT, "productos");
  await mkdir(outDir, { recursive: true });
  for (const file of await readdir(dir)) {
    if (!/\.(jpe?g|png)$/i.test(file)) continue;
    const base = file.replace(/\.(jpe?g|png)$/i, "");
    const input = path.join(dir, file);
    await sharp(input).rotate().resize({ width: 1254, height: 1254, fit: "inside", withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toFile(path.join(outDir, `${base}.webp`));
    // Miniatura para comparador / carrito.
    await sharp(input).rotate().resize({ width: 480, height: 480, fit: "inside" }).webp({ quality: 78 }).toFile(path.join(outDir, `${base}-480.webp`));
    const s = await stat(path.join(outDir, `${base}.webp`));
    console.log(`producto ${base}: ${(s.size / 1024).toFixed(0)} KB`);
  }
}

/** Convierte el fondo blanco conectado a los bordes en transparencia. */
async function mascot(file: string, outName: string, targetHeight: number) {
  const input = path.join(SRC, "mascota", file);
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const n = width * height;
  const isBg = new Uint8Array(n);
  const nearWhite = (i: number) => {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    return min >= 232 && max - min <= 14;
  };
  // Relleno por inundación desde todos los bordes (pila explícita).
  const stack: number[] = [];
  const push = (i: number) => {
    if (!isBg[i] && nearWhite(i)) {
      isBg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  // Canal alfa con borde suavizado: los píxeles del contorno conservan
  // opacidad parcial proporcional a qué tan lejos están del blanco.
  const rgba = Buffer.alloc(n * 4);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    let a = 255;
    if (isBg[i]) {
      a = 0;
    } else {
      const x = i % width;
      const y = (i / width) | 0;
      const touchesBg = (x > 0 && isBg[i - 1]) || (x < width - 1 && isBg[i + 1]) || (y > 0 && isBg[i - width]) || (y < height - 1 && isBg[i + width]);
      if (touchesBg) {
        const min = Math.min(r, g, b);
        a = Math.max(0, Math.min(255, Math.round(((255 - min) / (255 - 200)) * 255)));
      }
      if (a > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }
  const pad = 12;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const w = Math.min(width, maxX + pad) - left;
  const h = Math.min(height, maxY + pad) - top;
  const img = sharp(rgba, { raw: { width, height, channels: 4 } }).extract({ left, top, width: w, height: h }).resize({ height: targetHeight, withoutEnlargement: true });
  const outDir = path.join(OUT, "marca");
  await mkdir(outDir, { recursive: true });
  await img.clone().webp({ quality: 86, alphaQuality: 100, effort: 6 }).toFile(path.join(outDir, `${outName}.webp`));
  const meta = await sharp(path.join(outDir, `${outName}.webp`)).metadata();
  console.log(`mascota ${outName}: ${meta.width}x${meta.height}`);
}

async function main() {
  await products();
  await mascot("rino.png", "rincelito", 900);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
