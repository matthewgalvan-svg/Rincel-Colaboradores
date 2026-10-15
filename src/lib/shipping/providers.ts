import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { randomBytes } from "node:crypto";
import type { StoreSettings } from "@/lib/settings";
import type { ShippingProvider, QuoteRequest } from "./types";
import { ShippingError } from "./types";

/**
 * Proveedor SIMULADO: solo para desarrollo y pruebas. Calcula tarifas
 * ficticias claramente marcadas y genera guías "SIN VALIDEZ". El arranque en
 * producción lo bloquea (ver lib/env.ts).
 */
export function simulatedProvider(): ShippingProvider {
  return {
    id: "simulado",
    label: "Paquetería simulada (solo desarrollo)",
    simulated: true,
    requiresParcel: false,
    capabilities: { coverage: true, quote: true, createLabel: true, tracking: true, cancel: true },
    async checkCoverage(postalCode) {
      // Para probar el caso "sin cobertura": CP que empiezan con 99.
      return !postalCode.startsWith("99");
    },
    async quote(req: QuoteRequest) {
      if (req.postalCode.startsWith("99")) throw new ShippingError("no_coverage", "Sin cobertura en ese código postal (simulado).");
      if (req.postalCode === "00000") throw new ShippingError("provider_error", "Error del proveedor (simulado).");
      const units = req.items.reduce((s, i) => s + i.quantity, 0);
      const base = 9900 + Math.max(0, units - 1) * 500;
      return [
        { serviceCode: "sim-estandar", serviceName: "Estándar [SIMULADO]", carrier: "Paquetería de prueba", costCents: base, estimatedDays: "3 a 5 días hábiles (simulado)", providerQuoteId: `simq_${randomBytes(6).toString("hex")}` },
        { serviceCode: "sim-express", serviceName: "Express [SIMULADO]", carrier: "Paquetería de prueba", costCents: base + 8000, estimatedDays: "1 a 2 días hábiles (simulado)", providerQuoteId: `simq_${randomBytes(6).toString("hex")}` },
      ];
    },
    async createLabel(input) {
      if (input.address.postalCode === "00001") throw new Error("Fallo al crear guía (simulado).");
      const tracking = `SIM${randomBytes(5).toString("hex").toUpperCase()}`;
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([420, 300]);
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      page.drawText("GUÍA SIMULADA — SIN VALIDEZ", { x: 30, y: 250, size: 18, font, color: rgb(0.8, 0.1, 0.1) });
      page.drawText(`Pedido ${input.orderNumber}`, { x: 30, y: 210, size: 14, font });
      page.drawText(`Rastreo ${tracking}`, { x: 30, y: 185, size: 14, font });
      page.drawText(`${input.address.recipient} · CP ${input.address.postalCode}`, { x: 30, y: 160, size: 11, font });
      return { carrier: "Paquetería de prueba", trackingNumber: tracking, trackingUrl: null, providerShipmentId: `sims_${tracking}`, labelPdf: Buffer.from(await pdf.save()) };
    },
    async track() {
      return [];
    },
    async cancel() {},
  };
}

/**
 * Alternativa MANUAL configurada explícitamente por el negocio: una tarifa
 * fija publicada como tal (no finge cotizar con una paquetería). La guía la
 * captura el personal desde el panel.
 */
export function manualProvider(cfg: StoreSettings["shipping"]["manual"]): ShippingProvider {
  return {
    id: "manual",
    label: "Envío con tarifa fija (gestión manual)",
    simulated: false,
    requiresParcel: false,
    capabilities: { coverage: false, quote: true, createLabel: false, tracking: false, cancel: false },
    async quote() {
      return [
        {
          serviceCode: "manual-tarifa-fija",
          serviceName: cfg.label,
          carrier: null,
          costCents: cfg.costCents,
          estimatedDays: cfg.estimatedDays || null,
          providerQuoteId: null,
        },
      ];
    },
  };
}
