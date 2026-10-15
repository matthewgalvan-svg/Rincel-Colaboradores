"use client";

import { useEffect, useState } from "react";
import type { ProductCategory } from "@/lib/domain/types";
import { useCart } from "./CartProvider";

export interface PricedLineView {
  productId: string;
  variantCode: string;
  name: string;
  variantLabel: string;
  delivery: "physical" | "digital";
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  priceNote: string | null;
  linesPerUnit: number;
  category: ProductCategory;
  thumb: string | null;
}

export interface PricedCartView {
  lines: PricedLineView[];
  subtotalCents: number;
  requiresShipping: boolean;
  hasDigital: boolean;
  shippingCartHash: string | null;
  issues: { productId: string; variantCode?: string; code: string; message: string }[];
}

/** Totales calculados por el servidor para el carrito local. */
export function usePricedCart() {
  const { lines, ready } = useCart();
  const [data, setData] = useState<PricedCartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(lines);

  useEffect(() => {
    if (!ready) return;
    if (!lines.length) {
      setData({ lines: [], subtotalCents: 0, requiresShipping: false, hasDigital: false, shippingCartHash: null, issues: [] });
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch("/api/carrito", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }), signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: PricedCartView & { ok: boolean }) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") setError("No pudimos actualizar tu carrito. Revisa tu conexión.");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  return { data, loading: loading || !ready, error };
}
