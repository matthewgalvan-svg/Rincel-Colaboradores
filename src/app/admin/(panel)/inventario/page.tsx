import { and, desc, eq, gt, sql } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, PageHeader, Panel, inputCls } from "@/components/admin/ui";
import { db } from "@/db";
import { inventoryComponents, inventoryMovements, inventoryReservations, productVariants, variantComponents } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth/guard";
import { formatDateTime } from "@/lib/money";
import { adjustStockAction, componentMetaAction, mappingAction } from "./actions";

export const metadata = { title: "Inventario" };

export default async function InventarioPage() {
  await requireStaffPage("inventory.manage");
  const now = new Date();
  const [comps, reserved, mapping, variants, moves] = await Promise.all([
    db.select().from(inventoryComponents),
    db
      .select({ componentId: inventoryReservations.componentId, qty: sql<number>`sum(${inventoryReservations.quantity})::int` })
      .from(inventoryReservations)
      .where(and(eq(inventoryReservations.status, "active"), gt(inventoryReservations.expiresAt, now)))
      .groupBy(inventoryReservations.componentId),
    db.select().from(variantComponents),
    db.select().from(productVariants),
    db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.createdAt)).limit(100),
  ]);
  const res = (id: string) => reserved.find((r) => r.componentId === id)?.qty ?? 0;

  return (
    <>
      <PageHeader title="Inventario" description="Existencias por componente. Los paquetes consumen varios componentes (2×1 = 2 chips; kit = 12 chips + volantes). Las reservas vencen si el pago no se acredita." />
      <div className="grid gap-4 lg:grid-cols-2">
        {comps.map((c) => {
          const r = res(c.id);
          const avail = c.onHand - r;
          return (
            <Panel key={c.id} title={c.name}>
              <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-celeste-50 p-2">
                  <dt className="text-xs text-tinta-suave">En almacén</dt>
                  <dd className="text-xl font-extrabold">{c.onHand}</dd>
                </div>
                <div className="rounded-lg bg-celeste-50 p-2">
                  <dt className="text-xs text-tinta-suave">Apartado</dt>
                  <dd className="text-xl font-extrabold">{r}</dd>
                </div>
                <div className={`rounded-lg p-2 ${avail <= c.lowStockThreshold ? "bg-[#fff6e5]" : "bg-[#e7f6ee]"}`}>
                  <dt className="text-xs text-tinta-suave">Disponible</dt>
                  <dd className="text-xl font-extrabold">{avail}</dd>
                </div>
              </dl>
              {c.notes ? <p className="mt-2 text-xs text-tinta-suave">{c.notes}</p> : null}
              <ActionForm action={adjustStockAction} submitLabel="Aplicar ajuste" className="mt-4">
                <input type="hidden" name="componentId" value={c.id} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <input name="delta" type="number" className={inputCls} placeholder="+10 / -2" required aria-label="Cantidad (+/-)" />
                  <select name="reason" className={inputCls} aria-label="Motivo">
                    <option value="ajuste">Entrada / ajuste</option>
                    <option value="correccion">Corrección de conteo</option>
                    <option value="devolucion">Devolución</option>
                  </select>
                  <input name="note" className={inputCls} placeholder="Nota (obligatoria)" required />
                </div>
              </ActionForm>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-morado">Peso, medidas y alerta</summary>
                <ActionForm action={componentMetaAction} submitLabel="Guardar" className="mt-2">
                  <input type="hidden" name="componentId" value={c.id} />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Field label="Alerta ≤">
                      <input name="lowStockThreshold" type="number" defaultValue={c.lowStockThreshold} className={inputCls} />
                    </Field>
                    <Field label="Peso (g)">
                      <input name="weightGrams" type="number" defaultValue={c.weightGrams ?? ""} className={inputCls} />
                    </Field>
                    <Field label="Largo (cm)">
                      <input name="lengthCm" type="number" defaultValue={c.lengthCm ?? ""} className={inputCls} />
                    </Field>
                    <Field label="Ancho (cm)">
                      <input name="widthCm" type="number" defaultValue={c.widthCm ?? ""} className={inputCls} />
                    </Field>
                    <Field label="Alto (cm)">
                      <input name="heightCm" type="number" defaultValue={c.heightCm ?? ""} className={inputCls} />
                    </Field>
                  </div>
                  <p className="text-xs text-tinta-suave">Valores reales necesarios para cotizar con una paquetería. Vacío = por configurar.</p>
                </ActionForm>
              </details>
            </Panel>
          );
        })}
      </div>

      <Panel title="Componentes por variante" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-marino uppercase">
              <tr>
                <th className="py-2">Variante</th>
                <th className="py-2">Componente</th>
                <th className="py-2">Unidades</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde/60">
              {variants.map((v) => {
                const rows = mapping.filter((m) => m.variantId === v.id);
                return rows.length ? (
                  rows.map((m) => (
                    <tr key={`${v.id}-${m.componentId}`}>
                      <td className="py-2 font-bold">{v.id}</td>
                      <td className="py-2">{m.componentId}</td>
                      <td className="py-2">
                        <ActionForm action={mappingAction} submitLabel="Guardar" variant="secondary" className="grid-cols-[80px_auto] items-center">
                          <input type="hidden" name="variantId" value={v.id} />
                          <input type="hidden" name="componentId" value={m.componentId} />
                          <input name="quantity" type="number" min={0} defaultValue={m.quantity} className={inputCls} aria-label="Unidades" />
                        </ActionForm>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr key={v.id}>
                    <td className="py-2 font-bold">{v.id}</td>
                    <td className="py-2 text-tinta-suave" colSpan={2}>
                      Sin componentes físicos ({v.delivery === "digital" ? "entrega digital" : "revisar"})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Movimientos recientes" className="mt-6">
        <ul className="space-y-1 text-sm">
          {moves.map((m) => (
            <li key={m.id}>
              {formatDateTime(m.createdAt)} · <strong>{m.componentId}</strong> {m.delta > 0 ? `+${m.delta}` : m.delta} · {m.reason}
              {m.note ? ` · ${m.note}` : ""}
            </li>
          ))}
          {!moves.length ? <li className="text-tinta-suave">Sin movimientos.</li> : null}
        </ul>
      </Panel>
    </>
  );
}
