"use client";

import { useState } from "react";

export function ContactForm() {
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setState(null);
    try {
      const r = await fetch("/api/contacto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = (await r.json()) as { ok: boolean; message?: string };
      if (d.ok) {
        setState({ ok: true, text: "¡Gracias! Recibimos tu mensaje y te responderemos pronto." });
        setF({ name: "", email: "", phone: "", message: "", website: "" });
      } else setState({ ok: false, text: d.message ?? "No pudimos enviar tu mensaje. Tus datos se conservaron." });
    } catch {
      setState({ ok: false, text: "No pudimos conectar. Tus datos se conservaron; intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card grid gap-4 p-5">
      <div>
        <label htmlFor="c-name" className="field-label">
          Nombre
        </label>
        <input id="c-name" className="field-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} maxLength={120} autoComplete="name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="c-email" className="field-label">
            Correo
          </label>
          <input id="c-email" type="email" className="field-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="c-phone" className="field-label">
            Teléfono (opcional)
          </label>
          <input id="c-phone" type="tel" className="field-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
        </div>
      </div>
      <div>
        <label htmlFor="c-msg" className="field-label">
          ¿En qué te ayudamos?
        </label>
        <textarea id="c-msg" className="field-input min-h-32" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required minLength={10} maxLength={2000} />
      </div>
      {/* Campo trampa para bots: oculto a personas y tecnologías de asistencia. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="c-web">No llenar</label>
        <input id="c-web" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
      </div>
      {state ? (
        <p role="status" className={state.ok ? "font-semibold text-exito" : "field-error"}>
          {state.text}
        </p>
      ) : null}
      <button type="submit" className="btn-primary w-full sm:w-fit" disabled={busy}>
        {busy ? "Enviando…" : "Enviar mensaje"}
      </button>
    </form>
  );
}
