import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { recentAudit } from "@/lib/admin/queries";
import { requireStaffPage } from "@/lib/auth/guard";
import { formatDateTime } from "@/lib/money";

export const metadata = { title: "Auditoría" };

const ENTITIES = ["", "order", "product", "inventory", "settings", "user", "refund", "activation", "file", "support"];

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage("audit.read");
  const sp = await searchParams;
  const rows = await recentAudit(300, sp.entidad || undefined);
  return (
    <>
      <PageHeader title="Auditoría" description="Últimos 300 cambios administrativos. Los secretos nunca se registran." />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {ENTITIES.map((e) => (
          <Link key={e || "todo"} href={e ? `/admin/auditoria?entidad=${e}` : "/admin/auditoria"} className={`rounded-full px-3 py-1.5 font-bold ${(sp.entidad ?? "") === e ? "bg-marino text-white" : "bg-white text-marino"}`}>
            {e || "Todo"}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-2xl border border-borde/70 bg-white">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-celeste-50 text-marino uppercase">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Quién</th>
              <th className="px-3 py-2">Acción</th>
              <th className="px-3 py-2">Entidad</th>
              <th className="px-3 py-2">Antes</th>
              <th className="px-3 py-2">Después</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde/60 align-top">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                <td className="px-3 py-2">{r.actorEmail ?? "sistema"}</td>
                <td className="px-3 py-2 font-bold">{r.action}</td>
                <td className="px-3 py-2">
                  {r.entity}
                  {r.entityId ? <span className="block text-tinta-suave">{r.entityId.slice(0, 36)}</span> : null}
                </td>
                <td className="max-w-xs px-3 py-2 break-words text-tinta-suave">{r.before ? JSON.stringify(r.before).slice(0, 300) : ""}</td>
                <td className="max-w-xs px-3 py-2 break-words">{r.after ? JSON.stringify(r.after).slice(0, 300) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
