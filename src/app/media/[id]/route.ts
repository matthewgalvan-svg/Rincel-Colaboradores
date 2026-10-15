import { readStoredFile } from "@/lib/storage";

/** Imágenes públicas de producto cargadas desde el panel (los archivos privados nunca se sirven aquí). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("No encontrado", { status: 404 });
  const stored = await readStoredFile(id).catch(() => null);
  if (!stored || stored.file.isPrivate || stored.file.kind !== "producto") return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(stored.data), {
    headers: { "Content-Type": stored.file.mimeType, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
