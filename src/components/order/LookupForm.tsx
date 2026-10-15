"use client";

import { useState } from "react";

/** Solicita el enlace privado por correo. No revela si el pedido existe. */
export function LookupForm() {
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/pedido/enlace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number, email }) });
      const d = (await r.json()) as { ok: boolean; message?: string };
      setMsg({ ok: d.ok, text: d.message ?? "No pudimos procesar la solicitud." });
    } catch {
      setMsg({ ok: false, text: "No pudimos conectar. Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="lk-num" className="field-label">
          Número de pedido
        </label>
        <input id="lk-num" className="field-input uppercase" placeholder="RC-2610-XXXXX" value={number} onChange={(e) => setNumber(e.target.value)} required maxLength={20} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="lk-mail" className="field-label">
          Correo de la compra
        </label>
        <input id="lk-mail" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Enviando…" : "Enviar enlace"}
      </button>
      {msg ? (
        <p role="status" className={`sm:col-span-3 ${msg.ok ? "font-semibold text-exito" : "field-error"}`}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
