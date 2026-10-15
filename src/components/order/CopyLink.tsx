"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input readOnly value={url} className="field-input min-w-0 flex-1 text-sm" aria-label="Enlace privado del pedido" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn-dark min-h-12 shrink-0 px-5 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            /* el usuario puede copiar manualmente */
          }
        }}
      >
        {copied ? "¡Copiado!" : "Copiar enlace"}
      </button>
    </div>
  );
}
