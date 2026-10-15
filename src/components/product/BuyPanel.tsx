"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { track } from "@/components/analytics/track";
import { useCart } from "@/components/cart/CartProvider";
import { Icon } from "@/components/ui/Icon";
import type { PublicVariant } from "@/lib/catalog/queries";
import { formatMXN } from "@/lib/money";

interface Props {
  productId: string;
  name: string;
  priceCents: number;
  priceNote: string | null;
  ctaLabel: string;
  variants: PublicVariant[];
  chargeable: boolean;
  unitLabel?: string;
}

/**
 * Selección de modalidad y cantidad + botón de compra. En móvil se replica en
 * una barra fija inferior; la página reserva espacio para no tapar contenido.
 */
export function BuyPanel({ productId, name, priceCents, priceNote, ctaLabel, variants, chargeable, unitLabel }: Props) {
  const { add } = useCart();
  const router = useRouter();
  const firstAvailable = variants.find((v) => v.availableUnits === null || v.availableUnits > 0) ?? variants[0];
  const [variantCode, setVariantCode] = useState(firstAvailable?.code ?? "");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const groupId = useId();
  const selected = variants.find((v) => v.code === variantCode);
  const maxUnits = Math.min(10, selected?.availableUnits ?? 10);
  const soldOut = !selected || (selected.availableUnits !== null && selected.availableUnits <= 0);
  const disabled = !chargeable || soldOut;

  useEffect(() => {
    track("view_item", { productId, valueCents: priceCents });
  }, [productId, priceCents]);

  const buy = () => {
    if (disabled || !selected) return;
    add({ productId, variantCode: selected.code, quantity });
    setAdded(true);
    router.push("/carrito");
  };

  return (
    <div className="space-y-5">
      {variants.length > 1 ? (
        <fieldset>
          <legend className="field-label">Elige cómo quieres tus líneas</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {variants.map((v) => {
              const out = v.availableUnits !== null && v.availableUnits <= 0;
              return (
                <label key={v.code} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 font-bold transition-colors ${variantCode === v.code ? "border-morado bg-celeste-50 text-marino" : "border-borde bg-white text-tinta-suave hover:border-azul"} ${out ? "cursor-not-allowed opacity-60" : ""}`}>
                  <input type="radio" name={groupId} value={v.code} checked={variantCode === v.code} disabled={out} onChange={() => setVariantCode(v.code)} className="h-5 w-5 accent-morado" />
                  <span>
                    {v.label}
                    <span className="block text-xs font-semibold text-tinta-suave">{v.delivery === "digital" ? "Entrega digital, sin envío" : "Se envía a tu domicilio"}{out ? " · Agotado" : ""}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : selected ? (
        <p className="text-sm font-semibold text-tinta-suave">
          <Icon name={selected.delivery === "digital" ? "spark" : "truck"} className="mr-1 inline h-4 w-4" />
          {selected.label} · {selected.delivery === "digital" ? "entrega digital" : "se envía a tu domicilio"}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <span className="field-label" id={`${groupId}-qty`}>
            Cantidad{unitLabel ? ` (${unitLabel})` : ""}
          </span>
          <div className="inline-flex items-center rounded-full border border-borde" role="group" aria-labelledby={`${groupId}-qty`}>
            <button type="button" className="inline-flex h-12 w-12 items-center justify-center rounded-full text-marino hover:bg-celeste-50 disabled:opacity-40" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Quitar uno">
              <Icon name="minus" />
            </button>
            <output className="w-10 text-center text-lg font-extrabold" aria-live="polite">
              {quantity}
            </output>
            <button type="button" className="inline-flex h-12 w-12 items-center justify-center rounded-full text-marino hover:bg-celeste-50 disabled:opacity-40" onClick={() => setQuantity((q) => Math.min(maxUnits, q + 1))} disabled={quantity >= maxUnits} aria-label="Agregar uno">
              <Icon name="plus" />
            </button>
          </div>
        </div>
        {quantity > 1 ? <p className="pb-3 text-sm font-semibold text-tinta-suave">Total: {formatMXN(priceCents * quantity)} MXN</p> : null}
      </div>

      {priceNote ? <p className="rounded-xl bg-celeste px-4 py-3 text-sm font-bold text-marino">{priceNote}</p> : null}

      <button type="button" className="btn-primary w-full text-lg" onClick={buy} disabled={disabled}>
        {!chargeable ? "Disponible pronto" : soldOut ? "Agotado por ahora" : ctaLabel}
        {!disabled ? <Icon name="arrow" /> : null}
      </button>
      {added ? (
        <p role="status" className="text-sm font-bold text-exito">
          Agregado al carrito.
        </p>
      ) : null}

      {/* Barra fija en móvil: no tapa contenido porque la página reserva espacio inferior. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-white/97 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(33_32_68/0.25)] lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-tinta-suave">{name}</p>
            <p className="font-display text-2xl leading-none font-extrabold text-marino">
              {formatMXN(priceCents * quantity)} <span className="font-sans text-xs">MXN</span>
            </p>
          </div>
          <button type="button" className="btn-primary min-h-12 shrink-0 px-5 text-base" onClick={buy} disabled={disabled}>
            {!chargeable ? "Pronto" : soldOut ? "Agotado" : ctaLabel.length > 22 ? "Comprar" : ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
