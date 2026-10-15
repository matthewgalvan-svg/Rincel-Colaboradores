import Image from "next/image";
import Link from "next/link";

/**
 * Logo oficial (vectorial, extraído del PDF sin redibujar) con "Colaboradores"
 * como descriptor separado: no se modifica el dibujo del logo.
 */
export function LogoLockup({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5 rounded-lg py-1" aria-label="Rincel Colaboradores — inicio">
      <Image src="/marca/logo-rincel-wordmark.svg" alt="Rincel" width={1290} height={420} loading="eager" fetchPriority="high" unoptimized className={compact ? "h-7 w-auto" : "h-8 w-auto sm:h-9"} />
      <span aria-hidden="true" className="h-7 w-px bg-borde" />
      <span className="text-[0.95rem] font-extrabold tracking-wide text-morado sm:text-base">Colaboradores</span>
    </Link>
  );
}

/** Logo completo con la leyenda "Internet · Telefonía · Celulares". */
export function FullLogo({ className = "h-14 w-auto" }: { className?: string }) {
  return <Image src="/marca/logo-rincel.svg" alt="Rincel — Internet, Telefonía, Celulares" width={1282} height={530} unoptimized className={className} />;
}
