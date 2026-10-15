import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { supportRequests } from "@/db/schema";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(160),
  phone: z.string().trim().max(30).optional().default(""),
  message: z.string().trim().min(10).max(2000),
  website: z.string().max(200).optional().default(""),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "Origen no permitido.");
  if (!(await rateLimit(`contacto:${await clientIp()}`, 5, 3600))) return jsonError(429, "Demasiados mensajes. Intenta más tarde.");
  let parsed;
  try {
    parsed = schema.safeParse(await readJson(req));
  } catch {
    return jsonError(400, "Solicitud inválida.");
  }
  if (!parsed.success) return jsonError(400, "Revisa tu nombre, correo y mensaje (mínimo 10 caracteres).");
  // Trampa para bots: se responde como éxito sin guardar.
  if (parsed.data.website) return NextResponse.json({ ok: true });
  await db.insert(supportRequests).values({ type: "contacto", name: parsed.data.name, email: parsed.data.email.toLowerCase(), phone: parsed.data.phone || null, message: parsed.data.message });
  return NextResponse.json({ ok: true });
}
