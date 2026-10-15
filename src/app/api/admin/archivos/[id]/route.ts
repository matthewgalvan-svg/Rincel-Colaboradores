import { ForbiddenError, requirePermission } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { readStoredFile } from "@/lib/storage";

/** Archivos privados (guías, eSIM) solo para personal autorizado. Cada descarga se audita. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requirePermission("orders.read");
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response("No autorizado", { status: 403 });
    throw err;
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("No encontrado", { status: 404 });
  const stored = await readStoredFile(id);
  if (!stored || !stored.file.isPrivate) return new Response("No encontrado", { status: 404 });
  await audit({ actor: user, action: "archivo.descarga", entity: "file", entityId: id, after: { kind: stored.file.kind, orderId: stored.file.orderId } });
  return new Response(new Uint8Array(stored.data), {
    headers: {
      "Content-Type": stored.file.mimeType,
      "Content-Disposition": `attachment; filename="${stored.file.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
