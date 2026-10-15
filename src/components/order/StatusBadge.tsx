const TONES: Record<string, string> = {
  ok: "bg-[#e7f6ee] text-exito",
  warn: "bg-[#fff6e5] text-alerta",
  bad: "bg-[#fdecea] text-error",
  info: "bg-celeste text-marino",
  muted: "bg-[#eef0f4] text-tinta-suave",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  approved: "ok",
  delivered: "ok",
  activated: "ok",
  ready: "ok",
  pending: "warn",
  in_process: "warn",
  awaiting_payment: "muted",
  preparing: "info",
  label_created: "info",
  picked_up: "info",
  in_transit: "info",
  in_progress: "info",
  rejected: "bad",
  cancelled: "bad",
  expired: "bad",
  incident: "bad",
  on_hold: "bad",
  charged_back: "bad",
  refunded: "muted",
  partially_refunded: "muted",
  returned: "muted",
  not_required: "muted",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${TONES[STATUS_TONE[status] ?? "info"]}`}>{label}</span>;
}
