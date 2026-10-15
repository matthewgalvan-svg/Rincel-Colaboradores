"use client";

import { useActionState } from "react";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Formulario de acción de servidor con mensaje de resultado accesible. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "",
  confirm,
  variant = "dark",
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children?: React.ReactNode;
  submitLabel: string;
  className?: string;
  confirm?: string;
  variant?: "dark" | "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const btn = variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : variant === "danger" ? "btn bg-error text-white hover:bg-[#8f1c13]" : "btn-dark";
  return (
    <form
      action={formAction}
      className={`grid gap-3 ${className}`}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={`${btn} min-h-10 px-4 text-sm`} disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
        {state ? (
          <p role="status" className={`text-sm font-bold ${state.ok ? "text-exito" : "text-error"}`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
