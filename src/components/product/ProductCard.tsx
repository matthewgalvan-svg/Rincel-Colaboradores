import Image from "next/image";
import Link from "next/link";
import { keyFacts } from "@/lib/catalog/format";
import type { PublicProduct } from "@/lib/catalog/queries";
import { CATEGORY_LABELS } from "@/lib/domain/types";
import { formatMXN } from "@/lib/money";
import { Icon } from "@/components/ui/Icon";

export function PriceTag({ cents, size = "md", suffix }: { cents: number; size?: "md" | "lg" | "xl"; suffix?: string }) {
  const cls = size === "xl" ? "text-6xl" : size === "lg" ? "text-5xl" : "text-4xl";
  return (
    <p className="flex items-baseline gap-1.5 text-marino">
      <span className={`font-display ${cls} leading-none font-extrabold tracking-tight`}>{formatMXN(cents)}</span>
      <span className="text-sm font-extrabold">MXN</span>
      {suffix ? <span className="text-sm font-semibold text-tinta-suave">{suffix}</span> : null}
    </p>
  );
}

export function ProductCard({ product, headingLevel = "h3" }: { product: PublicProduct; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  const facts = keyFacts(product);
  const href = `/producto/${product.id}`;
  return (
    <article className="card group flex flex-col overflow-hidden">
      <Link href={href} className="relative block aspect-square bg-white" tabIndex={-1} aria-hidden="true">
        {product.thumb && product.image ? (
          <Image src={product.image.src} alt="" fill sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 360px" className="object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full items-center justify-center bg-celeste-50 font-display text-4xl font-extrabold text-morado">{product.shortName}</div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 border-t border-borde/60 p-5">
        <p className="chip w-fit">{CATEGORY_LABELS[product.category]}</p>
        <H className="text-xl leading-tight">
          <Link href={href} className="hover:text-morado">
            {product.name}
          </Link>
        </H>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {facts.map((f) => (
            <div key={f.label} className="rounded-xl bg-celeste-50 px-1.5 py-2">
              <dt className="sr-only">{f.label}</dt>
              <dd>
                <span className="block font-display text-xl leading-none font-extrabold text-morado">{f.value}</span>
                <span className="mt-1 block text-[0.7rem] leading-tight font-semibold text-tinta-suave">{f.label}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-col gap-3 pt-1">
          <PriceTag cents={product.priceCents} suffix={product.linesPerUnit === 2 ? "por las 2 líneas" : undefined} />
          {product.priceNote ? <p className="text-sm font-semibold text-tinta-suave">{product.priceNote}</p> : null}
          {!product.inStock ? <p className="text-sm font-bold text-alerta">Agotado por ahora</p> : null}
          <Link href={href} className="btn-primary w-full">
            {product.ctaLabel}
            <Icon name="arrow" className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
