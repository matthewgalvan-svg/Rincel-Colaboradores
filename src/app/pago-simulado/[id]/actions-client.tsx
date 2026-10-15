"use client";

import { useState } from "react";

const OPTIONS = [
  { k: "aprobar", label: "Aprobar con tarjeta" },
  { k: "pendiente_efectivo", label: "Pagar en efectivo (queda pendiente)" },
  { k: "pendiente_spei", label: "Transferencia SPEI (queda pendiente)" },
  { k: "rechazar", label: "Rechazar" },
  { k: "cancelar", label: "Cancelar" },
] as const;

export function SimulatedActions({ id }: { id: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (outcome: string) => {
    setBusy(outcome);
    setError(null);
    try {
      const r = await fetch("/api/dev/pago-simulado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, outcome }) });
      const d = (await r.json()) as { ok?: boolean; redirect?: string; error?: string };
      if (d.ok && d.redirect) window.location.assign(d.redirect);
      else setError(d.error ?? "Error");
    } catch {
      setError("Error de red");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-5 grid gap-2">
      {OPTIONS.map((o) => (
        <button key={o.k} type="button" className={o.k === "aprobar" ? "btn-dark" : "btn-secondary"} disabled={busy !== null} onClick={() => go(o.k)} data-outcome={o.k}>
          {busy === o.k ? "Procesando…" : o.label}
        </button>
      ))}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
