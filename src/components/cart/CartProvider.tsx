"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { track } from "@/components/analytics/track";

export interface CartLine {
  productId: string;
  variantCode: string;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  ready: boolean;
  count: number;
  add: (line: CartLine) => void;
  setQuantity: (productId: string, variantCode: string, quantity: number) => void;
  remove: (productId: string, variantCode: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "rincel.carrito.v1";
const MAX_QTY = 10;
const CartContext = createContext<CartContextValue | null>(null);

function sanitize(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is CartLine => !!l && typeof l === "object" && typeof (l as CartLine).productId === "string" && typeof (l as CartLine).variantCode === "string" && Number.isInteger((l as CartLine).quantity))
    .map((l) => ({ productId: l.productId.slice(0, 80), variantCode: l.variantCode.slice(0, 20), quantity: Math.min(MAX_QTY, Math.max(1, l.quantity)) }))
    .slice(0, 20);
}

/** Carrito persistente en este navegador. Los precios siempre se recalculan en el servidor. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Se fusiona con lo que se haya agregado antes de terminar de leer el almacenamiento.
    let stored: CartLine[] = [];
    try {
      stored = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
    } catch {
      stored = [];
    }
    setLines((prev) => {
      const merged = [...stored];
      for (const l of prev) {
        const i = merged.findIndex((m) => m.productId === l.productId && m.variantCode === l.variantCode);
        if (i === -1) merged.push(l);
        else merged[i] = { ...merged[i], quantity: Math.min(MAX_QTY, Math.max(merged[i].quantity, l.quantity)) };
      }
      return merged;
    });
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        try {
          setLines(sanitize(JSON.parse(e.newValue ?? "[]")));
        } catch {
          /* ignorar */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [lines, ready]);

  const add = useCallback((line: CartLine) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === line.productId && l.variantCode === line.variantCode);
      if (i === -1) return [...prev, { ...line, quantity: Math.min(MAX_QTY, line.quantity) }];
      const next = [...prev];
      next[i] = { ...next[i], quantity: Math.min(MAX_QTY, next[i].quantity + line.quantity) };
      return next;
    });
    track("add_to_cart", { productId: line.productId, meta: { variant: line.variantCode, quantity: line.quantity } });
  }, []);

  const setQuantity = useCallback((productId: string, variantCode: string, quantity: number) => {
    setLines((prev) => prev.map((l) => (l.productId === productId && l.variantCode === variantCode ? { ...l, quantity: Math.min(MAX_QTY, Math.max(1, quantity)) } : l)));
  }, []);

  const remove = useCallback((productId: string, variantCode: string) => {
    setLines((prev) => prev.filter((l) => !(l.productId === productId && l.variantCode === variantCode)));
    track("remove_from_cart", { productId, meta: { variant: variantCode } });
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(() => ({ lines, ready, count: lines.reduce((s, l) => s + l.quantity, 0), add, setQuantity, remove, clear }), [lines, ready, add, setQuantity, remove, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de CartProvider");
  return ctx;
}
