import type { Metadata } from "next";
import { paymentsAvailable } from "@/lib/payments";
import { getSettings, publicContact } from "@/lib/settings";
import { resolveShippingProvider } from "@/lib/shipping/service";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const settings = await getSettings();
  const payments = paymentsAvailable();
  const shipping = resolveShippingProvider(settings);
  return (
    <CheckoutForm
      paymentsReady={payments.ok}
      shippingMode={shipping ? (shipping.simulated ? "simulated" : shipping.id === "manual" ? "manual" : "provider") : "none"}
      manualShippingDescription={shipping?.id === "manual" ? settings.shipping.manual.description : null}
      contactUrl={publicContact(settings).whatsappUrl ?? "/contacto"}
    />
  );
}
