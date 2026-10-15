"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { hasExternalConsent } from "@/components/analytics/AnalyticsProvider";
import { deviceType, getAttribution, getSessionId, track } from "@/components/analytics/track";
import { useCart } from "@/components/cart/CartProvider";
import { usePricedCart } from "@/components/cart/usePricedCart";
import { Icon } from "@/components/ui/Icon";
import { MX_STATES } from "@/content/mx";
import { formatDateTime, formatMXN } from "@/lib/money";

interface QuoteOption {
  id: string;
  serviceName: string;
  carrier: string | null;
  costCents: number;
  estimatedDays: string | null;
  simulated: boolean;
  expiresAt: string;
  manual: boolean;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  recipient: string;
  postalCode: string;
  state: string;
  municipality: string;
  neighborhood: string;
  street: string;
  exteriorNumber: string;
  interiorNumber: string;
  references: string;
  acceptTerms: boolean;
}

const EMPTY: FormState = { name: "", email: "", phone: "", recipient: "", postalCode: "", state: "", municipality: "", neighborhood: "", street: "", exteriorNumber: "", interiorNumber: "", references: "", acceptTerms: false };
const FORM_KEY = "rincel.checkout.form";
const KEY_KEY = "rincel.checkout.key";

function loadSavedForm(): FormState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const saved = sessionStorage.getItem(FORM_KEY);
    return saved ? { ...EMPTY, ...(JSON.parse(saved) as Partial<FormState>), acceptTerms: false } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const FIELD_MAP: Record<string, keyof FormState> = {
  "customer.name": "name",
  "customer.email": "email",
  "customer.phone": "phone",
  "address.recipient": "recipient",
  "address.postalCode": "postalCode",
  "address.state": "state",
  "address.municipality": "municipality",
  "address.neighborhood": "neighborhood",
  "address.street": "street",
  "address.exteriorNumber": "exteriorNumber",
  "address.phone": "phone",
  "address.email": "email",
  acceptTerms: "acceptTerms",
};

function newKey() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function CheckoutForm({ paymentsReady, shippingMode, manualShippingDescription, contactUrl }: { paymentsReady: boolean; shippingMode: "none" | "manual" | "simulated" | "provider"; manualShippingDescription: string | null; contactUrl: string }) {
  const { lines, ready } = useCart();
  const { data: cart, loading } = usePricedCart();
  // Restaura datos capturados (se conservan si hay error o se recarga la página).
  const [form, setForm] = useState<FormState>(loadSavedForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [rawQuotes, setQuotes] = useState<QuoteOption[] | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "error" | "warning"; text: string } | null>(null);
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const { acceptTerms: _ignored, ...rest } = form;
      void _ignored;
      sessionStorage.setItem(FORM_KEY, JSON.stringify(rest));
    } catch {
      /* ignorar */
    }
  }, [form]);

  useEffect(() => {
    if (ready && lines.length) track("begin_checkout");
  }, [ready, lines.length]);

  // Si cambia el carrito o el CP, la cotización anterior deja de servir.
  const quoteFingerprint = `${cart?.shippingCartHash ?? ""}|${form.postalCode}`;
  const quotes = quotedFor === quoteFingerprint ? rawQuotes : null;

  const selectedQuote = quotes?.find((q) => q.id === quoteId) ?? null;
  const shippingCents = cart?.requiresShipping ? (selectedQuote?.costCents ?? null) : 0;
  const totalCents = cart && shippingCents !== null ? cart.subtotalCents + shippingCents : null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const showBanner = (b: { kind: "error" | "warning"; text: string }) => {
    setBanner(b);
    requestAnimationFrame(() => bannerRef.current?.focus());
  };

  async function quote() {
    setQuoteError(null);
    if (!/^\d{5}$/.test(form.postalCode)) {
      setErrors((e) => ({ ...e, postalCode: "Escribe un código postal de 5 dígitos." }));
      return;
    }
    setQuoting(true);
    try {
      const res = await fetch("/api/envios/cotizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, postalCode: form.postalCode, state: form.state, municipality: form.municipality, sessionId: getSessionId() }),
      });
      const d = (await res.json()) as { ok: boolean; options?: QuoteOption[]; message?: string };
      if (!d.ok || !d.options) {
        setQuotes(null);
        setQuoteError(d.message ?? "No pudimos cotizar el envío.");
        return;
      }
      setQuotes(d.options);
      setQuoteId(d.options[0]?.id ?? null);
      setQuotedFor(quoteFingerprint);
    } catch {
      setQuoteError("No pudimos cotizar el envío. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setQuoting(false);
    }
  }

  const checkoutKey = useMemo(() => {
    const fp = JSON.stringify([lines, quoteId, form.email.toLowerCase(), totalCents]);
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY_KEY) ?? "null") as { fp: string; key: string } | null;
      if (saved?.fp === fp) return saved.key;
      const key = newKey();
      sessionStorage.setItem(KEY_KEY, JSON.stringify({ fp, key }));
      return key;
    } catch {
      return newKey();
    }
  }, [lines, quoteId, form.email, totalCents]);

  function validateLocal(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (form.name.trim().length < 3) e.name = "Escribe tu nombre completo.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Escribe un correo válido.";
    if (!/^\+?[\d\s-]{10,18}$/.test(form.phone.trim())) e.phone = "Escribe un teléfono de 10 dígitos.";
    if (cart?.requiresShipping) {
      if (!/^\d{5}$/.test(form.postalCode)) e.postalCode = "El código postal debe tener 5 dígitos.";
      if (!form.state) e.state = "Elige el estado.";
      if (form.municipality.trim().length < 2) e.municipality = "Escribe el municipio o alcaldía.";
      if (form.neighborhood.trim().length < 2) e.neighborhood = "Escribe la colonia.";
      if (form.street.trim().length < 2) e.street = "Escribe la calle.";
      if (!form.exteriorNumber.trim()) e.exteriorNumber = "Escribe el número exterior.";
    }
    if (!form.acceptTerms) e.acceptTerms = "Debes aceptar los términos y el aviso de privacidad.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    if (!cart || !validateLocal()) {
      showBanner({ kind: "error", text: "Revisa los campos marcados." });
      return;
    }
    if (cart.requiresShipping && !selectedQuote) {
      showBanner({ kind: "error", text: "Cotiza y elige un envío antes de pagar." });
      return;
    }
    if (selectedQuote && new Date(selectedQuote.expiresAt) <= new Date()) {
      setQuotes(null);
      setQuoteId(null);
      showBanner({ kind: "warning", text: "La cotización de envío venció. Vuelve a cotizar para ver el costo actualizado." });
      return;
    }
    if (totalCents === null) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutKey,
          lines,
          customer: { name: form.name, email: form.email, phone: form.phone },
          address: cart.requiresShipping
            ? { recipient: form.recipient || form.name, email: form.email, phone: form.phone, postalCode: form.postalCode, state: form.state, municipality: form.municipality, neighborhood: form.neighborhood, street: form.street, exteriorNumber: form.exteriorNumber, interiorNumber: form.interiorNumber, references: form.references }
            : null,
          shippingQuoteId: cart.requiresShipping ? quoteId : null,
          expectedTotalCents: totalCents,
          acceptTerms: form.acceptTerms,
          analyticsConsent: hasExternalConsent(),
          attribution: getAttribution(),
          sessionId: getSessionId(),
          device: deviceType(),
        }),
      });
      const d = (await res.json()) as {
        ok: boolean;
        code?: string;
        message?: string;
        checkoutUrl?: string;
        fieldErrors?: Record<string, string>;
        issues?: { message: string }[];
        totalCents?: number;
        shippingCents?: number;
      };
      if (d.ok && d.checkoutUrl) {
        window.location.assign(d.checkoutUrl);
        return;
      }
      if (d.code === "invalid" && d.fieldErrors) {
        const mapped: Partial<Record<keyof FormState, string>> = {};
        for (const [k, v] of Object.entries(d.fieldErrors)) if (FIELD_MAP[k]) mapped[FIELD_MAP[k]] = v;
        setErrors(mapped);
        showBanner({ kind: "error", text: "Revisa los campos marcados." });
      } else if (d.code === "cart_issues") {
        showBanner({ kind: "error", text: d.issues?.map((i) => i.message).join(" ") ?? "Revisa tu carrito." });
      } else if (d.code === "quote_expired" || d.code === "quote_mismatch" || d.code === "shipping_unavailable") {
        setQuotes(null);
        setQuoteId(null);
        showBanner({ kind: "warning", text: d.message ?? "Vuelve a cotizar el envío." });
      } else if (d.code === "total_changed") {
        showBanner({ kind: "warning", text: `${d.message} Nuevo total: ${formatMXN(d.totalCents ?? 0)} MXN. Revisa el resumen y vuelve a confirmar.` });
      } else {
        showBanner({ kind: "error", text: d.message ?? "No pudimos continuar. Tus datos se conservaron; intenta de nuevo." });
      }
    } catch {
      showBanner({ kind: "error", text: "No pudimos conectar. Tus datos se conservaron; intenta de nuevo." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready || (loading && !cart)) {
    return (
      <div className="container-page pt-8" aria-busy="true">
        <h1 className="text-3xl">Finalizar compra</h1>
        <div className="mt-6 h-64 animate-pulse rounded-[1.25rem] bg-celeste-50" />
      </div>
    );
  }
  if (!lines.length || !cart?.lines.length) {
    return (
      <div className="container-page pt-12 text-center">
        <h1 className="text-3xl">No hay artículos para pagar</h1>
        <Link href="/planes" className="btn-primary mt-6">
          Encuentra tu plan
        </Link>
      </div>
    );
  }

  const shippingBlocked = cart.requiresShipping && shippingMode === "none";
  const field = (k: keyof FormState, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`f-${k}`} className="field-label">
        {label}
      </label>
      <input id={`f-${k}`} className="field-input" value={String(form[k])} onChange={(e) => set(k, e.target.value as never)} aria-invalid={Boolean(errors[k])} aria-describedby={errors[k] ? `e-${k}` : undefined} {...props} />
      {errors[k] ? (
        <p id={`e-${k}`} className="field-error">
          {errors[k]}
        </p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={pay} noValidate className="container-page pt-8 pb-12">
      <h1 className="text-3xl">Finalizar compra</h1>
      <p className="mt-1 text-tinta-suave">Compra como invitado. No necesitas crear cuenta.</p>

      {banner ? (
        <div ref={bannerRef} tabIndex={-1} role="alert" className={`mt-5 rounded-xl px-4 py-3 font-semibold ${banner.kind === "error" ? "bg-[#fdecea] text-error" : "bg-[#fff6e5] text-alerta"}`}>
          {banner.text}
        </div>
      ) : null}
      {cart.issues.length ? (
        <div role="alert" className="mt-5 rounded-xl bg-[#fff6e5] px-4 py-3 font-semibold text-alerta">
          {cart.issues.map((i) => i.message).join(" ")}{" "}
          <Link href="/carrito" className="underline">
            Revisar carrito
          </Link>
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <fieldset className="card p-5">
            <legend className="px-1 text-lg font-extrabold text-marino">1. Tus datos de contacto</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">{field("name", "Nombre completo", { autoComplete: "name" })}</div>
              {field("email", "Correo electrónico", { type: "email", autoComplete: "email", inputMode: "email" })}
              {field("phone", "Teléfono (10 dígitos)", { type: "tel", autoComplete: "tel", inputMode: "tel" })}
            </div>
            <p className="mt-3 text-xs text-tinta-suave">Usamos estos datos para tu pedido y la activación. No te pediremos NIP, contraseñas ni códigos.</p>
          </fieldset>

          {cart.requiresShipping ? (
            <fieldset className="card p-5">
              <legend className="px-1 text-lg font-extrabold text-marino">2. Dirección de entrega</legend>
              {shippingBlocked ? (
                <p className="pendiente mt-3">
                  Por ahora no tenemos un método de envío disponible para artículos físicos.{" "}
                  <a className="underline" href={contactUrl}>
                    Escríbenos
                  </a>{" "}
                  y te ayudamos.
                </p>
              ) : (
                <>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">{field("recipient", "¿Quién recibe? (opcional si eres tú)", { autoComplete: "shipping name" })}</div>
                    {field("postalCode", "Código postal", { inputMode: "numeric", autoComplete: "shipping postal-code", maxLength: 5 })}
                    <div>
                      <label htmlFor="f-state" className="field-label">
                        Estado
                      </label>
                      <select id="f-state" className="field-input" value={form.state} onChange={(e) => set("state", e.target.value)} aria-invalid={Boolean(errors.state)} autoComplete="shipping address-level1">
                        <option value="">Elige…</option>
                        {MX_STATES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      {errors.state ? <p className="field-error">{errors.state}</p> : null}
                    </div>
                    {field("municipality", "Municipio o alcaldía", { autoComplete: "shipping address-level2" })}
                    {field("neighborhood", "Colonia", { autoComplete: "shipping address-level3" })}
                    <div className="sm:col-span-2">{field("street", "Calle", { autoComplete: "shipping address-line1" })}</div>
                    {field("exteriorNumber", "Número exterior")}
                    {field("interiorNumber", "Número interior (opcional)")}
                    <div className="sm:col-span-2">{field("references", "Referencias (opcional)", { placeholder: "Entre calles, color de fachada…" })}</div>
                  </div>

                  <div className="mt-5 rounded-xl bg-celeste-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-extrabold text-marino">Costo de envío</p>
                      <button type="button" className="btn-dark min-h-11 px-5 text-sm" onClick={quote} disabled={quoting}>
                        {quoting ? "Cotizando…" : quotes ? "Volver a cotizar" : "Cotizar envío"}
                      </button>
                    </div>
                    {quoteError ? (
                      <p role="alert" className="field-error mt-2">
                        {quoteError}
                      </p>
                    ) : null}
                    {quotes ? (
                      <fieldset className="mt-3 space-y-2">
                        <legend className="sr-only">Opciones de envío</legend>
                        {quotes.map((q) => (
                          <label key={q.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 ${quoteId === q.id ? "border-morado" : "border-borde"}`}>
                            <input type="radio" name="envio" className="h-5 w-5 accent-morado" checked={quoteId === q.id} onChange={() => setQuoteId(q.id)} />
                            <span className="flex-1">
                              <span className="block font-bold text-marino">{q.serviceName}</span>
                              <span className="block text-xs text-tinta-suave">
                                {[q.carrier, q.estimatedDays].filter(Boolean).join(" · ")}
                                {q.manual ? ` · ${manualShippingDescription ?? "Tarifa fija; guía generada manualmente."}` : ""}
                              </span>
                            </span>
                            <span className="font-extrabold">{formatMXN(q.costCents)}</span>
                          </label>
                        ))}
                        {quotes[0]?.simulated ? <p className="text-xs font-bold text-alerta">Tarifa simulada de desarrollo: no es una cotización real.</p> : null}
                        <p className="text-xs text-tinta-suave">Cotización válida hasta {formatDateTime(quotes[0]?.expiresAt)}. Si vence, te mostraremos el costo actualizado antes de cobrar.</p>
                      </fieldset>
                    ) : (
                      <p className="mt-2 text-sm text-tinta-suave">Escribe tu código postal y cotiza para ver el costo antes de pagar.</p>
                    )}
                  </div>
                </>
              )}
            </fieldset>
          ) : null}

          {cart.hasDigital ? (
            <p className="flex gap-2 rounded-xl border border-borde bg-white p-4 text-sm text-tinta-suave">
              <Icon name="spark" className="mt-0.5 h-5 w-5 shrink-0 text-morado" />
              Las eSIM se entregan de forma digital después del pago y la validación de compatibilidad; no llevan envío. Te contactaremos para la activación.
            </p>
          ) : null}
        </div>

        <aside className="card h-fit p-5 lg:sticky lg:top-20" aria-label="Resumen del pedido">
          <h2 className="text-xl">Resumen</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {cart.lines.map((l) => (
              <li key={`${l.productId}:${l.variantCode}`} className="flex justify-between gap-3">
                <span>
                  <span className="font-bold text-marino">
                    {l.quantity} × {l.name}
                  </span>
                  <span className="block text-xs text-tinta-suave">{l.variantLabel}</span>
                </span>
                <span className="font-bold whitespace-nowrap">{formatMXN(l.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-borde/60 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Subtotal</dt>
              <dd className="font-bold">{formatMXN(cart.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Envío</dt>
              <dd className="font-bold">{cart.requiresShipping ? (selectedQuote ? formatMXN(selectedQuote.costCents) : "Por cotizar") : "No aplica"}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-borde/60 pt-3">
              <dt className="font-extrabold text-marino">Total</dt>
              <dd className="font-display text-3xl font-extrabold text-marino">{totalCents !== null ? `${formatMXN(totalCents)} MXN` : "—"}</dd>
            </div>
          </dl>

          <div className="mt-5">
            <label className="flex gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-morado" checked={form.acceptTerms} onChange={(e) => set("acceptTerms", e.target.checked)} aria-invalid={Boolean(errors.acceptTerms)} aria-describedby={errors.acceptTerms ? "e-acceptTerms" : undefined} />
              <span>
                Acepto los{" "}
                <Link href="/politicas/terminos" className="link" target="_blank">
                  términos
                </Link>{" "}
                y el{" "}
                <Link href="/politicas/privacidad" className="link" target="_blank">
                  aviso de privacidad
                </Link>
                . Entiendo que la compra no activa la línea automáticamente.
              </span>
            </label>
            {errors.acceptTerms ? (
              <p id="e-acceptTerms" className="field-error">
                {errors.acceptTerms}
              </p>
            ) : null}
          </div>

          <button type="submit" className="btn-primary mt-5 w-full text-lg" disabled={submitting || !paymentsReady || shippingBlocked || Boolean(cart.issues.length)}>
            {submitting ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
            {!submitting ? <Icon name="arrow" /> : null}
          </button>
          {!paymentsReady ? (
            <p className="pendiente mt-3">
              Los pagos en línea aún no están disponibles.{" "}
              <a className="underline" href={contactUrl}>
                Escríbenos
              </a>
              .
            </p>
          ) : null}
          <p className="mt-3 flex gap-2 text-xs text-tinta-suave">
            <Icon name="shield" className="h-4 w-4 shrink-0" />
            Te llevaremos al entorno seguro de Mercado Pago. Ahí eliges el medio de pago disponible (tarjeta, SPEI o efectivo, según disponibilidad). Tu pedido se confirma solo cuando el pago se acredita.
          </p>
        </aside>
      </div>
    </form>
  );
}
