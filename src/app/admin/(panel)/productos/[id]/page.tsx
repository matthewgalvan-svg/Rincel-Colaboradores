import Image from "next/image";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, PageHeader, Panel, inputCls } from "@/components/admin/ui";
import { db } from "@/db";
import { products, productVariants, variantComponents } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth/guard";
import { commercialImageState } from "@/lib/catalog/facts";
import { centsToDecimalString } from "@/lib/money";
import { approveImageAction, replaceImageAction, saveProductAction, variantAction } from "../actions";

export const metadata = { title: "Editar producto" };

export default async function ProductoEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("products.manage");
  const { id } = await params;
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p) notFound();
  const variants = await db.select().from(productVariants).where(eq(productVariants.productId, id));
  const comps = await db.select().from(variantComponents);
  const imgState = commercialImageState(p);
  const hidden = <input type="hidden" name="id" value={p.id} />;

  return (
    <>
      <PageHeader title={p.name} description={`Identificador: ${p.id}`} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Datos comerciales">
          <ActionForm action={saveProductAction} submitLabel="Guardar cambios">
            {hidden}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <input name="name" defaultValue={p.name} className={inputCls} required />
              </Field>
              <Field label="Nombre corto">
                <input name="shortName" defaultValue={p.shortName} className={inputCls} required />
              </Field>
              <Field label="Estado">
                <select name="status" defaultValue={p.status} className={inputCls}>
                  <option value="draft">Borrador (no visible)</option>
                  <option value="active">Publicado</option>
                  <option value="hidden">Oculto</option>
                  <option value="archived">Archivado</option>
                </select>
              </Field>
              <Field label="Cobro" hint="Desactívalo si faltan datos por confirmar.">
                <select name="chargeable" defaultValue={p.chargeable ? "1" : "0"} className={inputCls}>
                  <option value="1">Habilitado</option>
                  <option value="0">Deshabilitado</option>
                </select>
              </Field>
              <Field label="Precio MXN" hint="Precio del servidor: es el que se cobra.">
                <input name="price" defaultValue={centsToDecimalString(p.priceCents)} className={inputCls} inputMode="decimal" required />
              </Field>
              <Field label="GB para navegar" hint="Vacío = pendiente/no aplica (no es cero).">
                <input name="dataGb" defaultValue={p.dataGb ?? ""} className={inputCls} inputMode="decimal" />
              </Field>
              <Field label="Vigencia (días)">
                <input name="validityDays" defaultValue={p.validityDays ?? ""} className={inputCls} inputMode="numeric" />
              </Field>
              <Field label="Bolsa de redes sociales (GB)">
                <input name="socialDataGb" defaultValue={p.socialDataGb ?? ""} className={inputCls} inputMode="decimal" />
              </Field>
              <Field label="Redes sociales ilimitadas (sujetas a condiciones)">
                <select name="socialUnlimited" defaultValue={p.socialUnlimited ? "1" : "0"} className={inputCls}>
                  <option value="1">Sí</option>
                  <option value="0">No</option>
                </select>
              </Field>
              <Field label="Texto del botón (CTA)">
                <input name="ctaLabel" defaultValue={p.ctaLabel} className={inputCls} required />
              </Field>
            </div>
            <Field label="Frase corta">
              <input name="tagline" defaultValue={p.tagline} className={inputCls} />
            </Field>
            <Field label="Nota junto al precio">
              <input name="priceNote" defaultValue={p.priceNote ?? ""} className={inputCls} />
            </Field>
            <Field label="Descripción">
              <textarea name="description" defaultValue={p.description} className={`${inputCls} min-h-24`} />
            </Field>
            <Field label="Qué incluye (una línea por punto)">
              <textarea name="features" defaultValue={p.features.join("\n")} className={`${inputCls} min-h-28`} />
            </Field>
            <Field label="Requisitos (una línea por punto)">
              <textarea name="requirements" defaultValue={p.requirements.join("\n")} className={`${inputCls} min-h-20`} />
            </Field>
            <Field label="Condiciones públicas (una línea por punto)">
              <textarea name="conditions" defaultValue={p.conditions.join("\n")} className={`${inputCls} min-h-28`} />
            </Field>
            <Field label="Pendientes internos (nunca se publican)">
              <textarea name="internalPending" defaultValue={p.internalPending.join("\n")} className={`${inputCls} min-h-24 bg-[#fff6e5]`} />
            </Field>
            <Field label="Texto alternativo de la imagen">
              <textarea name="imageAlt" defaultValue={p.imageAlt} className={`${inputCls} min-h-16`} />
            </Field>
            <Field label="Descripción para buscadores">
              <input name="seoDescription" defaultValue={p.seoDescription ?? ""} className={inputCls} />
            </Field>
          </ActionForm>
        </Panel>

        <div className="grid h-fit gap-6">
          <Panel title="Imagen comercial">
            {p.imagePath ? <Image src={p.imagePath} alt={p.imageAlt} width={600} height={600} className="h-auto w-full rounded-lg border border-borde/60" /> : <p className="text-sm text-tinta-suave">Sin imagen.</p>}
            <p className={`mt-2 text-sm font-bold ${imgState === "ok" ? "text-exito" : "text-error"}`}>
              {imgState === "ok"
                ? "Vigente: coincide con el precio y beneficios actuales."
                : imgState === "outdated"
                  ? "Desactualizada: el precio o beneficios cambiaron. No se publica; reemplázala o apruébala tras verificarla."
                  : imgState === "review_required"
                    ? `En revisión: no se publica.${p.altImagePath ? " Se muestra la imagen alterna sin afirmaciones." : ""}`
                    : "Sin imagen."}
            </p>
            <ActionForm action={replaceImageAction} submitLabel="Reemplazar imagen" className="mt-4">
              {hidden}
              <input type="file" name="image" accept="image/png,image/jpeg,image/webp" className="text-sm" />
              <label className="flex gap-2 text-xs">
                <input type="checkbox" name="confirm" value="1" /> La nueva imagen muestra el precio y los beneficios vigentes.
              </label>
            </ActionForm>
            {user.role === "admin" && p.imagePath && imgState !== "ok" ? (
              <ActionForm action={approveImageAction} submitLabel="Aprobar cartel actual" variant="secondary" className="mt-4" confirm="Solo aprueba si verificaste que todo lo impreso en el cartel es correcto y confirmado.">
                {hidden}
                <label className="flex gap-2 text-xs">
                  <input type="checkbox" name="confirm" value="1" /> Verifiqué el cartel contra los datos vigentes y confirmados.
                </label>
              </ActionForm>
            ) : null}
          </Panel>

          <Panel title="Modalidades (variantes)">
            <ul className="grid gap-3 text-sm">
              {variants.map((v) => (
                <li key={v.id} className="rounded-lg bg-celeste-50 p-3">
                  <p className="font-bold">
                    {v.label} · {v.delivery === "digital" ? "digital" : "física"} · {v.active ? "activa" : "inactiva"}
                  </p>
                  <p className="text-xs text-tinta-suave">
                    Componentes:{" "}
                    {comps
                      .filter((c) => c.variantId === v.id)
                      .map((c) => `${c.quantity}× ${c.componentId}`)
                      .join(", ") || "ninguno"}
                  </p>
                  <ActionForm action={variantAction} submitLabel={v.active ? "Desactivar" : "Activar"} variant="secondary" className="mt-2">
                    <input type="hidden" name="variantId" value={v.id} />
                    <input type="hidden" name="active" value={v.active ? "0" : "1"} />
                  </ActionForm>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-tinta-suave">La eSIM solo está confirmada para el 2×1. Los componentes se editan en Inventario.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
