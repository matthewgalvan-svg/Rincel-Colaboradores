import Link from "next/link";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-tinta-suave">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, children, className = "", actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-borde/70 bg-white p-5 ${className}`}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-lg">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, delta }: { label: string; value: string; hint?: string; delta?: string | null }) {
  return (
    <div className="rounded-2xl border border-borde/70 bg-white p-4">
      <p className="text-xs font-bold tracking-wide text-tinta-suave uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold text-marino">{value}</p>
      {delta ? <p className="text-xs font-bold text-tinta-suave">{delta}</p> : null}
      {hint ? <p className="mt-1 text-xs text-tinta-suave">{hint}</p> : null}
    </div>
  );
}

export function AlertLink({ href, n, label, tone = "warn" }: { href: string; n: number; label: string; tone?: "warn" | "bad" }) {
  if (!n) return null;
  return (
    <Link href={href} className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-bold ${tone === "bad" ? "bg-[#fdecea] text-error" : "bg-[#fff6e5] text-alerta"} hover:underline`}>
      <span>{label}</span>
      <span className="rounded-full bg-white px-2 py-0.5 text-xs">{n}</span>
    </Link>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-bold text-marino">{label}</span>
      {children}
      {hint ? <span className="text-xs text-tinta-suave">{hint}</span> : null}
    </label>
  );
}

export const inputCls = "min-h-10 w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm focus:border-azul focus:ring-2 focus:ring-azul/30 focus:outline-none";
