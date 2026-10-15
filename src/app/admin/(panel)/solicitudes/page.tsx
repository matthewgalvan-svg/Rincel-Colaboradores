import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { PageHeader, inputCls } from "@/components/admin/ui";
import { supportList } from "@/lib/admin/queries";
import { requireStaffPage } from "@/lib/auth/guard";
import { formatDateTime } from "@/lib/money";
import { updateSupportAction } from "./actions";

export const metadata = { title: "Solicitudes" };

export default async function SolicitudesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage("support.manage");
  const sp = await searchParams;
  const rows = await supportList(sp.estado || undefined);
  return (
    <>
      <PageHeader title="Solicitudes de clientes" description="Contacto, devoluciones, reembolsos e incidencias. Un reembolso real se ejecuta desde el pedido." />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {["", "abierta", "en_revision", "resuelta", "rechazada"].map((s) => (
          <Link key={s || "todas"} href={s ? `/admin/solicitudes?estado=${s}` : "/admin/solicitudes"} className={`rounded-full px-3 py-1.5 font-bold ${(sp.estado ?? "") === s ? "bg-marino text-white" : "bg-white text-marino"}`}>
            {s || "Todas"}
          </Link>
        ))}
      </nav>
      <div className="grid gap-4">
        {rows.map((r) => (
          <article key={r.id} className="rounded-2xl border border-borde/70 bg-white p-4">
            <p className="text-sm">
              <strong className="uppercase">{r.type}</strong> · {r.status} · {formatDateTime(r.createdAt)}
              {r.orderId ? (
                <>
                  {" "}
                  ·{" "}
                  <Link className="link" href={`/admin/pedidos/${r.orderId}`}>
                    ver pedido
                  </Link>
                </>
              ) : null}
            </p>
            <p className="mt-1 text-sm text-tinta-suave">
              {r.name} · {r.email} {r.phone ? `· ${r.phone}` : ""}
            </p>
            <p className="mt-2 whitespace-pre-wrap">{r.message}</p>
            <ActionForm action={updateSupportAction} submitLabel="Actualizar" className="mt-3">
              <input type="hidden" name="id" value={r.id} />
              <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
                <select name="status" defaultValue={r.status} className={inputCls} aria-label="Estado">
                  <option value="abierta">Abierta</option>
                  <option value="en_revision">En revisión</option>
                  <option value="resuelta">Resuelta</option>
                  <option value="rechazada">Rechazada</option>
                </select>
                <input name="resolution" defaultValue={r.resolution ?? ""} className={inputCls} placeholder="Resolución / nota interna" />
              </div>
            </ActionForm>
          </article>
        ))}
        {!rows.length ? <p className="text-tinta-suave">Sin solicitudes.</p> : null}
      </div>
    </>
  );
}
