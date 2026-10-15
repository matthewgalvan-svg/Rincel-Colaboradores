import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { orderWhere } from "@/lib/admin/queries";
import { audit } from "@/lib/audit";
import { ForbiddenError, requirePermission } from "@/lib/auth/guard";
import { centsToDecimalString } from "@/lib/money";

/** Evita inyección de fórmulas en hojas de cálculo y escapa comillas. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  let user;
  try {
    user = await requirePermission("orders.export");
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response("No autorizado", { status: 403 });
    throw err;
  }
  const sp = new URL(req.url).searchParams;
  const where = orderWhere({
    q: sp.get("q") ?? undefined,
    payment: sp.get("pago") ?? undefined,
    shipping: sp.get("envio") ?? undefined,
    activation: sp.get("activacion") ?? undefined,
    fulfillment: sp.get("prep") ?? undefined,
    review: sp.get("revision") === "1",
    includeTest: sp.get("pruebas") === "1",
    from: sp.get("desde") ? new Date(`${sp.get("desde")}T00:00:00-06:00`) : undefined,
    to: sp.get("hasta") ? new Date(`${sp.get("hasta")}T23:59:59-06:00`) : undefined,
  });
  const rows = await db.select().from(orders).where(where).orderBy(asc(orders.createdAt)).limit(10_000);
  const items = rows.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((r) => r.id))) : [];
  const header = ["pedido", "creado", "pagado", "pago", "preparacion", "envio", "activacion", "revision", "subtotal", "envio_mxn", "total", "articulos", "cliente", "correo", "telefono", "cp", "estado", "utm_source", "utm_campaign", "dispositivo", "prueba"];
  const lines = [header.map(cell).join(",")];
  for (const o of rows) {
    const its = items.filter((i) => i.orderId === o.id).map((i) => `${i.quantity}x ${i.productName} (${i.variantLabel})`).join("; ");
    lines.push(
      [
        o.number,
        o.createdAt,
        o.paidAt,
        o.paymentStatus,
        o.fulfillmentStatus,
        o.shippingStatus,
        o.activationStatus,
        o.reviewRequired ? o.reviewReason : "",
        centsToDecimalString(o.subtotalCents),
        centsToDecimalString(o.shippingCents),
        centsToDecimalString(o.totalCents),
        its,
        o.customerName,
        o.email,
        o.phone,
        o.shippingAddress?.postalCode ?? "",
        o.shippingAddress?.state ?? "",
        o.attribution.utm_source ?? "",
        o.attribution.utm_campaign ?? "",
        o.deviceType ?? "",
        o.isTest ? "si" : "no",
      ]
        .map(cell)
        .join(","),
    );
  }
  await audit({ actor: user, action: "pedidos.exportar_csv", entity: "order", after: { count: rows.length, filtros: Object.fromEntries(sp) } });
  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const dynamic = "force-dynamic";
