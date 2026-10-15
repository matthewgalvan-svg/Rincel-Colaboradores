"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
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
const EMPTY: CartLine[] = [];
const CartContext = createContext<CartContextValue | null>(null);

function sanitize(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is CartLine => !!l && typeof l === "object" && typeof (l as CartLine).productId === "string" && typeof (l as CartLine).variantCode === "string" && Number.isInteger((l as CartLine).quantity))
    .map((l) => ({ productId: l.productId.slice(0, 80), variantCode: l.variantCode.slice(0, 20), quantity: Math.min(MAX_QTY, Math.max(1, l.quantity)) }))
    .slice(0, 20);
}

/*
 * El carrito vive en localStorage como almacén externo: todas las pestañas y
 * componentes leen la misma fuente y no hay carreras al hidratar.
 */
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cacheLines: CartLine[] = EMPTY;
let memoryFallback: CartLine[] = EMPTY;

function readLines(): CartLine[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryFallback;
  }
  if (raw === cacheRaw) return cacheLines;
  cacheRaw = raw;
  try {
    cacheLines = sanitize(JSON.parse(raw ?? "[]"));
  } catch {
    cacheLines = EMPTY;
  }
  return cacheLines;
}

function writeLines(next: CartLine[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    memoryFallback = next;
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const noopSubscribe = () => () => {};

/** Carrito persistente en este navegador. Los precios siempre se recalculan en el servidor. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const lines = useSyncExternalStore(subscribe, readLines, () => EMPTY);
  // false durante la hidratación (igual que el servidor), true después.
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const add = useCallback((line: CartLine) => {
    const prev = readLines();
    const i = prev.findIndex((l) => l.productId === line.productId && l.variantCode === line.variantCode);
    const next = i === -1 ? [...prev, { ...line, quantity: Math.min(MAX_QTY, line.quantity) }] : prev.map((l, idx) => (idx === i ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + line.quantity) } : l));
    writeLines(next);
    track("add_to_cart", { productId: line.productId, meta: { variant: line.variantCode, quantity: line.quantity } });
  }, []);

  const setQuantity = useCallback((productId: string, variantCode: string, quantity: number) => {
    writeLines(readLines().map((l) => (l.productId === productId && l.variantCode === variantCode ? { ...l, quantity: Math.min(MAX_QTY, Math.max(1, quantity)) } : l)));
  }, []);

  const remove = useCallback((productId: string, variantCode: string) => {
    writeLines(readLines().filter((l) => !(l.productId === productId && l.variantCode === variantCode)));
    track("remove_from_cart", { productId, meta: { variant: variantCode } });
  }, []);

  const clear = useCallback(() => writeLines([]), []);

  const value = useMemo(() => ({ lines, ready, count: lines.reduce((s, l) => s + l.quantity, 0), add, setQuantity, remove, clear }), [lines, ready, add, setQuantity, remove, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de CartProvider");
  return ctx;
}
