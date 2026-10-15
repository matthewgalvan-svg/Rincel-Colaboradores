"use client";

import { useState } from "react";

export function SupportRequestForm({ number, token }: { number: string; token: string }) {
  const [type, setType] = useState("incidencia");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 10) {
      setState({ kind: "error", text: "Cuéntanos un poco más (mínimo 10 caracteres)." });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/pedido/solicitud", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number, token, type, message }) });
      const d = (await r.json()) as { ok: boolean; message?: string };
      if (d.ok) {
        setState({ kind: "ok", text: "Recibimos tu solicitud. Te contactaremos pronto." });
        setMessage("");
      } else setState({ kind: "error", text: d.message ?? "No pudimos enviar tu solicitud." });
    } catch {
      setState({ kind: "error", text: "No pudimos enviar tu solicitud. Tu mensaje se conservó; intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mt-4 grid gap-4 p-5" noValidate>
      <div>
        <label htmlFor="sr-type" className="field-label">
          Tipo de solicitud
        </label>
        <select id="sr-type" className="field-input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="incidencia">Reportar una incidencia</option>
          <option value="devolucion">Solicitar devolución</option>
          <option value="reembolso">Solicitar reembolso</option>
        </select>
      </div>
      <div>
        <label htmlFor="sr-msg" className="field-label">
          Mensaje
        </label>
        <textarea id="sr-msg" className="field-input min-h-28" maxLength={1500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="No incluyas NIP, contraseñas ni datos de tarjeta." />
      </div>
      {state ? (
        <p role="status" className={state.kind === "ok" ? "font-bold text-exito" : "field-error"}>
          {state.text}
        </p>
      ) : null}
      <button type="submit" className="btn-dark w-fit" disabled={busy}>
        {busy ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}
