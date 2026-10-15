import Image from "next/image";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, PageHeader, Panel, inputCls } from "@/components/admin/ui";
import { db } from "@/db";
import { inventoryComponents, products } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth/guard";
import { commercialImageState } from "@/lib/catalog/facts";
import { CATEGORY_LABELS } from "@/lib/domain/types";
import { variantAvailability } from "@/lib/inventory/service";
import { formatMXN } from "@/lib/money";
import { createDraftAction } from "./actions";

export const metadata = { title: "Productos" };

const IMAGE_STATE: Record<string, { label: string; cls: string }> = {
  ok: { label: "Imagen vigente", cls: "text-exito" },
  outdated: { label: "Imagen desactualizada (oculta)", cls: "text-error" },
  review_required: { label: "Imagen en revisión (oculta)", cls: "text-alerta" },
  missing: { label: "Sin imagen", cls: "text-tinta-suave" },
};

const STATUS: Record<string, string> = { draft: "Borrador", active: "Publicado", hidden: "Oculto", archived: "Archivado" };

export default async function ProductosPage() {
  await requireStaffPage("products.manage");
  const [rows, comps, avail] = await Promise.all([db.select().from(products).orderBy(asc(products.sortOrder)), db.select().from(inventoryComponents), variantAvailability(db)]);
  return (
    <>
      <PageHeader title="Productos" description={`${rows.length} productos. Se definieron 13; el producto 14 está pendiente (no se publica sin datos).`} />
      <div className="grid gap-3">
        {rows.map((p) => {
          const st = IMAGE_STATE[commercialImageState(p)];
          const units = [...avail.entries()].filter(([k]) => k.startsWith(`${p.id}:`)).map(([k, v]) => `${k.split(":")[1]}: ${v === null ? "sin límite" : v}`);
          return (
            <Link key={p.id} href={`/admin/productos/${p.id}`} className="flex items-center gap-4 rounded-2xl border border-borde/70 bg-white p-3 hover:border-morado">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-celeste-50">{p.imagePath ? <Image src={p.altImagePath && commercialImageState(p) !== "ok" ? p.altImagePath : p.imagePath} alt="" fill sizes="64px" className="object-contain" /> : null}</div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-marino">{p.name}</p>
                <p className="text-xs text-tinta-suave">
                  {CATEGORY_LABELS[p.category]} · {STATUS[p.status]} · {p.chargeable ? "cobro habilitado" : "sin cobro"} · disponibles {units.join(", ") || "—"}
                </p>
                <p className={`text-xs font-bold ${st.cls}`}>{st.label}</p>
              </div>
              <p className="font-display text-2xl font-extrabold text-marino">{formatMXN(p.priceCents)}</p>
            </Link>
          );
        })}
      </div>

      <Panel title="Nuevo producto (borrador)" className="mt-8">
        <ActionForm action={createDraftAction} submitLabel="Crear borrador">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Identificador (url)">
              <input name="id" className={inputCls} placeholder="p. ej. rino-400-portabilidad" required />
            </Field>
            <Field label="Nombre">
              <input name="name" className={inputCls} required />
            </Field>
            <Field label="Precio MXN">
              <input name="price" type="number" step="0.01" min="1" className={inputCls} required />
            </Field>
            <Field label="Categoría">
              <select name="category" className={inputCls}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Entrega">
              <select name="delivery" className={inputCls}>
                <option value="physical">Física (con envío)</option>
                <option value="digital">Digital (eSIM)</option>
              </select>
            </Field>
            <Field label="Componente de inventario">
              <select name="componentId" className={inputCls}>
                <option value="">Ninguno</option>
                {comps.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unidades del componente por producto">
              <input name="componentQty" type="number" min="1" defaultValue={1} className={inputCls} />
            </Field>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}
