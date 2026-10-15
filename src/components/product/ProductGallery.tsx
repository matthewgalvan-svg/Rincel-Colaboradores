"use client";

import Image from "next/image";
import { useRef } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * Pieza comercial completa (sin recortes: precios, vigencias y condiciones
 * visibles) con opción de ampliar en un diálogo accesible.
 */
export function ProductGallery({ src, alt, name }: { src: string; alt: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <div>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="group relative block w-full overflow-hidden rounded-[1.25rem] border border-borde/70 bg-white" aria-label={`Ampliar imagen de ${name}`}>
        <Image src={src} alt={alt} width={1254} height={1254} loading="eager" fetchPriority="high" sizes="(max-width: 1024px) 100vw, 560px" className="h-auto w-full object-contain" />
        <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-bold text-marino shadow">
          <Icon name="zoom" className="h-4 w-4" /> Ampliar
        </span>
      </button>
      <dialog ref={dialogRef} className="m-auto max-h-[95dvh] w-[min(96vw,1000px)] rounded-2xl bg-white p-0 backdrop:bg-marino/70" aria-label={`Imagen ampliada de ${name}`} onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}>
        <div className="sticky top-0 flex justify-end bg-white/95 p-2">
          <button type="button" className="inline-flex h-11 items-center gap-2 rounded-full px-4 font-bold text-marino hover:bg-celeste-50" onClick={() => dialogRef.current?.close()} autoFocus>
            <Icon name="close" className="h-5 w-5" /> Cerrar
          </button>
        </div>
        <Image src={src} alt={alt} width={1254} height={1254} sizes="96vw" className="h-auto w-full" />
      </dialog>
    </div>
  );
}
