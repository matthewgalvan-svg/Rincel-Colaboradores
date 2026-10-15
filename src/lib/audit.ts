import "server-only";
import { db, type DbOrTx } from "@/db";
import { auditLog } from "@/db/schema";

const SECRET_KEYS = /token|secret|password|clave|nip/i;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[oculto]" : scrub(v)]));
  }
  return value;
}

/** Registro de auditoría de cambios administrativos. Nunca guarda secretos. */
export async function audit(
  entry: { actor: { id: string; email: string } | null; action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown },
  tx: DbOrTx = db,
) {
  await tx.insert(auditLog).values({
    actorUserId: entry.actor?.id ?? null,
    actorEmail: entry.actor?.email ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before === undefined ? null : scrub(entry.before),
    after: entry.after === undefined ? null : scrub(entry.after),
  });
}
