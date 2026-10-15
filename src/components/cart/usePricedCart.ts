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

const EMPTY_VIEW: PricedCartView = { lines: [], subtotalCents: 0, requiresShipping: false, hasDigital: false, shippingCartHash: null, issues: [] };

/** Totales calculados por el servidor para el carrito local. */
export function usePricedCart() {
  const { lines, ready } = useCart();
  const key = JSON.stringify(lines);
  const [result, setResult] = useState<{ key: string; data: PricedCartView | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!ready || !lines.length) return;
    const ctrl = new AbortController();
    fetch("/api/carrito", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }), signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: PricedCartView) => setResult({ key, data: d, error: null }))
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") setResult((prev) => ({ key, data: prev?.data ?? null, error: "No pudimos actualizar tu carrito. Revisa tu conexión." }));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  if (!ready) return { data: null, loading: true, error: null };
  if (!lines.length) return { data: EMPTY_VIEW, loading: false, error: null };
  const fresh = result?.key === key;
  return { data: result?.data ?? null, loading: !fresh, error: fresh ? result.error : null };
}
