import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runJobs } from "@/lib/jobs";
import { safeEqual } from "@/lib/security/tokens";

/** Trabajos periódicos. Llamar cada 5–10 min con `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const report = await runJobs();
  return NextResponse.json(report);
}
