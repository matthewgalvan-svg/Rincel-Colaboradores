import type { FaqItem } from "@/content/faq";
import { Icon } from "./Icon";

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-borde/70 rounded-[1.25rem] border border-borde/70 bg-white">
      {items.map((f) => (
        <details key={f.id} id={`faq-${f.id}`} className="group px-5 py-1 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left font-bold text-marino">
            {f.q}
            <Icon name="plus" className="h-5 w-5 shrink-0 text-morado transition-transform group-open:rotate-45" />
          </summary>
          <p className="pb-4 leading-relaxed text-tinta-suave">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
