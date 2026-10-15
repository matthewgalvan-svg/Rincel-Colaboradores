"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/CartProvider";

/** El pedido ya guarda los artículos: se vacía el carrito local y el formulario. */
export function ClearCartOnMount() {
  const { clear, ready } = useCart();
  useEffect(() => {
    if (!ready) return;
    clear();
    try {
      sessionStorage.removeItem("rincel.checkout.form");
      sessionStorage.removeItem("rincel.checkout.key");
    } catch {
      /* ignorar */
    }
  }, [ready, clear]);
  return null;
}
