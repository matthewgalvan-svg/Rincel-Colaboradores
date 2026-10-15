"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { track } from "@/components/analytics/track";
import { useCart } from "@/components/cart/CartProvider";
import { usePricedCart } from "@/components/cart/usePricedCart";
import { Icon } from "@/components/ui/Icon";
import { formatMXN } from "@/lib/money";

export function CartView() {
  const { lines, setQuantity, remove, ready } = useCart();
  const { data, loading, error } = usePricedCart();

  useEffect(() => {
    if (ready && lines.length) track("view_cart");
  }, [ready, lines.length]);

  if (!ready || (loading && !data)) {
    return (
      <div className="container-page pt-8" aria-busy="true">
        <h1 className="text-3xl">Tu carrito</h1>
        <div className="mt-6 h-40 animate-pulse rounded-[1.25rem] bg-celeste-50" />
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="container-page pt-12 text-center">
        <Image src="/marca/rincelito.webp" alt="" width={160} height={178} className="mx-auto h-40 w-auto" />
        <h1 className="mt-4 text-3xl">Tu carrito está vacío</h1>
        <p className="mt-2 text-tinta-suave">Elige un plan, chip o MiFi para empezar.</p>
        <Link href="/planes" className="btn-primary mt-6">
          Encuentra tu plan
        </Link>
      </div>
    );
  }

  const hasDataChip = data?.lines.some((l) => l.category === "datos");
  const hasMifi = data?.lines.some((l) => l.category === "equipo");

  return (
    <div className="container-page pt-8 pb-10">
      <h1 className="text-3xl">Tu carrito</h1>
      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-[#fdecea] px-4 py-3 font-semibold text-error">
          {error}
        </p>
      ) : null}
      {data?.issues.length ? (
        <div role="alert" className="mt-4 space-y-2">
          {data.issues.map((i) => (
            <div key={`${i.productId}-${i.variantCode ?? ""}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-alerta/40 bg-[#fff6e5] px-4 py-3 text-sm font-semibold text-alerta">
              <span>{i.message}</span>
              <button type="button" className="font-extrabold underline" onClick={() => remove(i.productId, i.variantCode ?? lines.find((l) => l.productId === i.productId)?.variantCode ?? "")}>
                Quitar del carrito
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <ul className="space-y-4" aria-label="Artículos">
          {data?.lines.map((l) => (
            <li key={`${l.productId}:${l.variantCode}`} className="card flex gap-4 p-4">
              <Link href={`/producto/${l.productId}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-borde/60 bg-white sm:h-28 sm:w-28">
                {l.thumb ? <Image src={l.thumb} alt="" fill sizes="112px" className="object-contain" /> : null}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/producto/${l.productId}`} className="font-extrabold text-marino hover:text-morado">
                      {l.name}
                    </Link>
                    <p className="text-sm text-tinta-suave">
                      {l.variantLabel} · {l.delivery === "digital" ? "entrega digital, sin envío" : "se envía a domicilio"}
                    </p>
                    {l.priceNote ? <p className="mt-1 text-xs font-semibold text-tinta-suave">{l.priceNote}</p> : null}
                  </div>
                  <p className="font-display text-2xl font-extrabold text-marino">{formatMXN(l.lineTotalCents)}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center rounded-full border border-borde" role="group" aria-label={`Cantidad de ${l.name}`}>
                    <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-celeste-50 disabled:opacity-40" onClick={() => setQuantity(l.productId, l.variantCode, l.quantity - 1)} disabled={l.quantity <= 1} aria-label="Quitar uno">
                      <Icon name="minus" className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center font-extrabold" aria-live="polite">
                      {l.quantity}
                    </span>
                    <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-celeste-50 disabled:opacity-40" onClick={() => setQuantity(l.productId, l.variantCode, l.quantity + 1)} disabled={l.quantity >= 10} aria-label="Agregar uno">
                      <Icon name="plus" className="h-4 w-4" />
                    </button>
                  </div>
                  <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-tinta-suave hover:bg-celeste-50 hover:text-error" onClick={() => remove(l.productId, l.variantCode)}>
                    <Icon name="trash" className="h-4 w-4" /> Quitar
                  </button>
                </div>
                {l.quantity > 1 ? <p className="mt-1 text-xs text-tinta-suave">{formatMXN(l.unitPriceCents)} c/u</p> : null}
              </div>
            </li>
          ))}
        </ul>

        <aside className="card h-fit p-5 lg:sticky lg:top-20" aria-label="Resumen">
          <h2 className="text-xl">Resumen</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Subtotal</dt>
              <dd className="font-extrabold">{formatMXN(data?.subtotalCents ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Envío</dt>
              <dd className="text-right font-semibold">{data?.requiresShipping ? "Se cotiza con tu código postal antes de pagar" : "No aplica"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-tinta-suave">Precios en pesos mexicanos. Pago único: no hay cobros automáticos ni cargos ocultos.</p>
          <Link href="/checkout" aria-disabled={!data?.lines.length || Boolean(data?.issues.length)} className={`btn-primary mt-5 w-full ${!data?.lines.length || data?.issues.length ? "pointer-events-none opacity-60" : ""}`}>
            Continuar con mi compra
            <Icon name="arrow" />
          </Link>
          <Link href="/planes" className="btn-ghost mt-2 w-full">
            Seguir comprando
          </Link>
        </aside>
      </div>

      {hasDataChip && !hasMifi ? (
        <p className="mt-8 rounded-xl bg-celeste-50 px-4 py-3 text-sm text-marino">
          ¿Quieres compartir internet por Wi-Fi? Los chips de datos no incluyen equipo.{" "}
          <Link href="/producto/mifi-rincel" className="link">
            Ver MiFi Rincel
          </Link>
        </p>
      ) : null}
      {hasMifi && !hasDataChip ? (
        <p className="mt-8 rounded-xl bg-celeste-50 px-4 py-3 text-sm text-marino">
          También tenemos chips Rincel de solo datos para dispositivos compatibles.{" "}
          <Link href="/planes/chips-datos" className="link">
            Ver chips de datos
          </Link>
        </p>
      ) : null}
    </div>
  );
}
