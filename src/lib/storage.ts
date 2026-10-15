import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { files } from "@/db/schema";
import { sha256Hex } from "@/lib/security/tokens";

/**
 * Almacenamiento de archivos en disco local (STORAGE_DIR, fuera de `public/`).
 * Los privados (guías, eSIM) solo se entregan por rutas con control de acceso.
 * Para despliegues sin disco persistente, reemplazar por un adaptador S3
 * compatible manteniendo esta misma interfaz.
 */
function baseDir() {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function sniffMime(data: Buffer): string | null {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (data[0] === 0x89 && data.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export async function saveFile(
  input: { kind: "guia" | "esim" | "producto"; data: Buffer; filename: string; mimeType: string; orderId?: string | null; uploadedBy?: string | null; isPrivate: boolean },
  tx: DbOrTx = db,
) {
  if (input.data.length === 0 || input.data.length > MAX_UPLOAD_BYTES) throw new Error("El archivo está vacío o excede 8 MB.");
  const sniffed = sniffMime(input.data);
  if (!sniffed || !ALLOWED_MIME.has(sniffed)) throw new Error("Tipo de archivo no permitido (PDF, PNG, JPG o WebP).");
  const ext = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[sniffed];
  const key = `${input.isPrivate ? "private" : "public"}/${input.kind}/${randomUUID()}.${ext}`;
  const full = path.join(baseDir(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, input.data, { mode: 0o600 });
  const safeName = input.filename.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/g, "_").slice(0, 120) || `archivo.${ext}`;
  const [row] = await tx
    .insert(files)
    .values({
      kind: input.kind,
      storageKey: key,
      filename: safeName,
      mimeType: sniffed,
      sizeBytes: input.data.length,
      sha256: sha256Hex(input.data),
      isPrivate: input.isPrivate,
      orderId: input.orderId ?? null,
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning();
  return row;
}

export async function readStoredFile(fileId: string, tx: DbOrTx = db) {
  const [row] = await tx.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!row) return null;
  const full = path.join(baseDir(), row.storageKey);
  // Defensa adicional contra rutas manipuladas.
  if (!full.startsWith(baseDir() + path.sep)) return null;
  const data = await readFile(full);
  return { file: row, data };
}
