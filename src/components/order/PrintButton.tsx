"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn-primary min-h-11 text-sm" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}
