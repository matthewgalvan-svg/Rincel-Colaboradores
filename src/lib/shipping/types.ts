import type { ShippingAddress, ShippingStatus } from "@/lib/domain/types";

export interface ParcelSpec {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface QuoteRequest {
  postalCode: string;
  state?: string;
  municipality?: string;
  /** Componentes físicos y cantidades (para calcular peso/medidas). */
  items: { componentId: string; quantity: number }[];
  parcel: ParcelSpec | null;
}

export interface QuoteOption {
  serviceCode: string;
  serviceName: string;
  carrier: string | null;
  costCents: number;
  estimatedDays: string | null;
  providerQuoteId: string | null;
}

export interface LabelResult {
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  providerShipmentId: string | null;
  labelPdf: Buffer | null;
}

export interface TrackingEvent {
  status: ShippingStatus;
  description: string;
  occurredAt: Date;
  providerEventId: string | null;
}

export interface ShippingCapabilities {
  coverage: boolean;
  quote: boolean;
  createLabel: boolean;
  tracking: boolean;
  cancel: boolean;
}

/**
 * Contrato de un proveedor de envíos intercambiable. Para conectar una
 * paquetería real se implementa esta interfaz con su API documentada; no se
 * inventan endpoints.
 */
export interface ShippingProvider {
  id: string;
  label: string;
  /** true = tarifas de prueba; prohibido en producción. */
  simulated: boolean;
  /** Requiere peso y medidas reales para cotizar. */
  requiresParcel: boolean;
  capabilities: ShippingCapabilities;
  checkCoverage?(postalCode: string): Promise<boolean>;
  quote(req: QuoteRequest): Promise<QuoteOption[]>;
  createLabel?(input: { orderNumber: string; address: ShippingAddress; serviceCode: string; parcel: ParcelSpec | null; idempotencyKey: string }): Promise<LabelResult>;
  track?(input: { trackingNumber: string; providerShipmentId: string | null }): Promise<TrackingEvent[]>;
  cancel?(input: { providerShipmentId: string }): Promise<void>;
}

export class ShippingError extends Error {
  constructor(
    public code: "no_provider" | "no_coverage" | "missing_parcel" | "provider_error" | "invalid_postal_code",
    message: string,
  ) {
    super(message);
    this.name = "ShippingError";
  }
}
