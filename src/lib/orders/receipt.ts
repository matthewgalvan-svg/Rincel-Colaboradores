import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DbOrTx } from "@/db";
import { receipts } from "@/db/schema";
import { formatDateTime, formatMXNFixed } from "@/lib/money";

export interface ReceiptData {
  sellerName: string;
  receiptNumber: string;
  orderNumber: string;
  issuedAt: string;
  paidAt: string | null;
  customerName: string;
  items: { name: string; variant: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  shippingLabel: string | null;
  totalCents: number;
  currency: "MXN";
  paymentProvider: string;
  paymentReference: string | null;
  paymentMethod: string | null;
  isTest: boolean;
}

/** Crea el comprobante una sola vez por pedido (idempotente). */
export async function issueReceipt(tx: DbOrTx, orderId: string, data: ReceiptData) {
  await tx
    .insert(receipts)
    .values({ orderId, number: data.receiptNumber, data: data as unknown as Record<string, unknown> })
    .onConflictDoNothing();
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  credit_card: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  prepaid_card: "Tarjeta prepagada",
  ticket: "Efectivo en establecimiento",
  bank_transfer: "Transferencia (SPEI)",
  atm: "Cajero / banca",
  account_money: "Saldo Mercado Pago",
  digital_currency: "Mercado Crédito",
};

export function paymentTypeLabel(t: string | null | undefined) {
  if (!t) return null;
  return PAYMENT_TYPE_LABELS[t] ?? t;
}

let logoPaths: { d: string; color: [number, number, number] }[] | null = null;
let logoViewBox: [number, number, number, number] = [0, 0, 1, 1];

/** Extrae los trazos vectoriales del logo oficial (derivado del PDF) para dibujarlos en el comprobante. */
function loadLogo() {
  if (logoPaths) return logoPaths;
  const svg = readFileSync(path.join(process.cwd(), "public/marca/logo-rincel.svg"), "utf8");
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
  if (vb?.length === 4) logoViewBox = vb as [number, number, number, number];
  logoPaths = [...svg.matchAll(/<path[^>]*fill="rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)"[^>]*\sd="([^"]+)"/g)].map((m) => ({
    color: [Number(m[1]) / 100, Number(m[2]) / 100, Number(m[3]) / 100],
    d: m[4],
  }));
  return logoPaths;
}

/** Comprobante de compra en PDF. No es un CFDI ni desglosa impuestos. */
export async function renderReceiptPdf(r: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Comprobante ${r.receiptNumber}`);
  pdf.setAuthor(r.sellerName);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0x21 / 255, 0x20 / 255, 0x44 / 255);
  const muted = rgb(0.35, 0.36, 0.45);

  // Logo vectorial (sin redibujar): se escalan los trazos originales.
  const paths = loadLogo();
  const targetWidth = 150;
  const scale = targetWidth / logoViewBox[2];
  for (const p of paths) {
    page.drawSvgPath(p.d, { x: 48 - logoViewBox[0] * scale, y: 800 + logoViewBox[1] * scale, scale, color: rgb(...p.color) });
  }

  const text = (pg: PDFPage, s: string, x: number, y: number, size = 10, f: PDFFont = font, color = navy) => pg.drawText(s, { x, y, size, font: f, color });
  text(page, "Comprobante de compra", 330, 790, 16, bold);
  text(page, r.sellerName, 330, 772, 10, font, muted);
  if (r.isTest) text(page, "PRUEBA — SIN VALIDEZ COMERCIAL", 330, 756, 10, bold, rgb(0.75, 0.1, 0.1));

  let y = 720;
  const row = (label: string, value: string) => {
    text(page, label, 48, y, 10, bold);
    text(page, value, 190, y, 10);
    y -= 16;
  };
  row("Comprobante", r.receiptNumber);
  row("Pedido", r.orderNumber);
  row("Fecha de emisión", formatDateTime(r.issuedAt));
  if (r.paidAt) row("Fecha de pago", formatDateTime(r.paidAt));
  row("Cliente", r.customerName);
  row("Medio de pago", [r.paymentProvider, r.paymentMethod].filter(Boolean).join(" · "));
  if (r.paymentReference) row("Referencia", r.paymentReference);

  y -= 14;
  page.drawRectangle({ x: 48, y: y - 6, width: 499, height: 22, color: rgb(0xd0 / 255, 0xe5 / 255, 0xf6 / 255) });
  text(page, "Artículo", 56, y, 10, bold);
  text(page, "Cant.", 360, y, 10, bold);
  text(page, "Precio", 410, y, 10, bold);
  text(page, "Importe", 480, y, 10, bold);
  y -= 24;
  for (const it of r.items) {
    text(page, it.name.slice(0, 58), 56, y, 10, bold);
    text(page, String(it.quantity), 368, y);
    text(page, formatMXNFixed(it.unitPriceCents), 410, y);
    text(page, formatMXNFixed(it.lineTotalCents), 480, y);
    y -= 13;
    text(page, it.variant.slice(0, 70), 56, y, 9, font, muted);
    y -= 18;
  }
  y -= 6;
  page.drawLine({ start: { x: 48, y: y + 10 }, end: { x: 547, y: y + 10 }, thickness: 0.5, color: muted });
  const total = (label: string, value: string, isBold = false) => {
    text(page, label, 360, y, isBold ? 12 : 10, isBold ? bold : font);
    text(page, value, 480, y, isBold ? 12 : 10, isBold ? bold : font);
    y -= isBold ? 20 : 16;
  };
  total("Subtotal", formatMXNFixed(r.subtotalCents));
  if (r.discountCents > 0) total("Descuentos", `-${formatMXNFixed(r.discountCents)}`);
  total(r.shippingLabel ? `Envío` : "Envío", r.shippingCents > 0 ? formatMXNFixed(r.shippingCents) : "Sin costo / no aplica");
  total("Total MXN", formatMXNFixed(r.totalCents), true);

  y -= 20;
  const notes = [
    "Este documento es un comprobante de compra. No es un CFDI (factura electrónica) y no desglosa impuestos.",
    "Comprar no activa líneas automáticamente: la activación y la portabilidad se gestionan después del pago.",
    "Conserva tu enlace privado del pedido para consultar envío y activación.",
  ];
  for (const n of notes) {
    text(page, n, 48, y, 8.5, font, muted);
    y -= 13;
  }
  return pdf.save();
}
