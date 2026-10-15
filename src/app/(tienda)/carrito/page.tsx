import type { Metadata } from "next";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Carrito", robots: { index: false, follow: false } };

export default function CarritoPage() {
  return <CartView />;
}
