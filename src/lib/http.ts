import "server-only";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/** Protección CSRF para endpoints JSON del navegador: exige mismo origen. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    const expected = new URL(env().APP_URL);
    const got = new URL(origin);
    if (got.host === expected.host) return true;
    // En desarrollo se permite el host con el que se accedió (localhost / 127.0.0.1).
    return env().APP_ENV !== "production" && got.host === req.headers.get("host");
  } catch {
    return false;
  }
}

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(req: Request, maxBytes = 32_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("Solicitud demasiado grande.");
  return text ? JSON.parse(text) : {};
}
