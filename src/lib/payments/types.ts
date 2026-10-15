import type { PaymentStatus } from "@/lib/domain/types";

export interface CheckoutItem {
  title: string;
  unitPriceCents: number;
  quantity: number;
  externalCode: string;
}

export interface CreateCheckoutInput {
  orderNumber: string;
  totalCents: number;
  items: CheckoutItem[];
  payer: { email: string; firstName: string; lastName: string };
  returnUrls: { success: string; failure: string; pending: string };
  /** Minutos que el enlace de pago permanece disponible. */
  expiresInMinutes: number;
  /** Horas para pagos en efectivo / transferencia. */
  offlineDueHours: number;
  idempotencyKey: string;
}

export interface CheckoutSession {
  providerOrderId: string;
  checkoutUrl: string;
}

export interface ProviderTransaction {
  id: string;
  status: PaymentStatus;
  rawStatus: string | null;
  rawStatusDetail: string | null;
  amountCents: number | null;
  paidAmountCents: number | null;
  refundedAmountCents: number | null;
  paymentMethodId: string | null;
  paymentType: string | null;
  dateOfExpiration: Date | null;
}

/** Estado real de un cobro consultado desde el servidor del proveedor. */
export interface ProviderOrderState {
  providerOrderId: string;
  status: PaymentStatus;
  rawStatus: string | null;
  rawStatusDetail: string | null;
  externalReference: string | null;
  totalAmountCents: number | null;
  paidAmountCents: number | null;
  currency: string | null;
  countryCode: string | null;
  receiverId: string | null;
  liveMode: boolean | null;
  transactions: ProviderTransaction[];
}

export interface WebhookInput {
  headers: Headers;
  query: URLSearchParams;
  body: unknown;
}

export type WebhookVerification =
  | { valid: true; topic: string | null; action: string | null; resourceId: string | null; requestId: string | null; liveMode: boolean | null }
  | { valid: false; reason: string; requestId: string | null };

export interface PaymentGateway {
  id: "mercadopago" | "simulated";
  environment: "sandbox" | "production" | "simulated";
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  getOrder(providerOrderId: string): Promise<ProviderOrderState>;
  refund(input: { providerOrderId: string; transactionId?: string; amountCents?: number; idempotencyKey: string }): Promise<{ providerRefundId: string | null; status: "approved" | "processing" | "rejected" }>;
  verifyWebhook(input: WebhookInput): WebhookVerification;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public retriable: boolean,
    public httpStatus?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
