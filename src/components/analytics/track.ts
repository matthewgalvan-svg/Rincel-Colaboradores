"use client";

import type { ClientEventName } from "@/lib/analytics/events";

/**
 * Medición propia y seudónima: identificador aleatorio de sesión, UTM y tipo
 * de dispositivo. Nunca se envían correo, teléfono, domicilio ni datos del
 * formulario. "purchase" solo lo registra el servidor al aprobarse el pago.
 */
const SESSION_KEY = "rincel.sesion";
const UTM_KEY = "rincel.utm";
const SESSION_TTL_MS = 30 * 60 * 1000;

interface SessionInfo {
  id: string;
  last: number;
}

function randomId() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getSessionId(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const now = Date.now();
    let s: SessionInfo | null = raw ? (JSON.parse(raw) as SessionInfo) : null;
    if (!s || now - s.last > SESSION_TTL_MS) s = { id: randomId(), last: now };
    s.last = now;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return s.id;
  } catch {
    return null;
  }
}

export function captureAttribution() {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = params.get(k);
      if (v) utm[k] = v.slice(0, 120);
    }
    if (document.referrer) {
      const host = new URL(document.referrer).host;
      if (host && host !== window.location.host) utm.referrer_host = host.slice(0, 120);
    }
    if (Object.keys(utm).length) sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
  } catch {
    /* ignorar */
  }
}

export function getAttribution(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(UTM_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function deviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  return w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop";
}

export function track(name: ClientEventName, data: { productId?: string; ctaId?: string; valueCents?: number; meta?: Record<string, string | number | boolean> } = {}) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ name, sessionId: getSessionId(), path: window.location.pathname, device: deviceType(), attribution: getAttribution(), ...data });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/eventos", new Blob([payload], { type: "application/json" }));
    } else {
      void fetch("/api/eventos", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  } catch {
    /* la medición nunca debe romper la compra */
  }
  // Herramientas externas opcionales, solo con consentimiento (ver ConsentBanner).
  const w = window as unknown as { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void; __rincelConsent?: boolean };
  if (w.__rincelConsent) {
    w.gtag?.("event", name, { item_id: data.productId, cta_id: data.ctaId });
    const fbMap: Partial<Record<ClientEventName, string>> = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout" };
    if (fbMap[name]) w.fbq?.("track", fbMap[name], { content_ids: data.productId ? [data.productId] : undefined });
  }
}
