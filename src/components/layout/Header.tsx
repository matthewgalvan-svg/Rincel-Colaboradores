"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoLockup } from "@/components/brand/Logo";
import { useCart } from "@/components/cart/CartProvider";
import { Icon } from "@/components/ui/Icon";

const NAV = [
  { href: "/planes/portabilidad", label: "Portabilidad" },
  { href: "/planes/linea-nueva", label: "Línea nueva" },
  { href: "/planes/chips-datos", label: "Chips de datos" },
  { href: "/planes/mifi", label: "MiFi" },
  { href: "/comparar", label: "Comparar" },
  { href: "/vende-rincel", label: "Vende Rincel" },
  { href: "/preguntas-frecuentes", label: "Ayuda" },
];

export function Header() {
  const { count, ready } = useCart();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-30 print:hidden border-b border-borde/60 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <LogoLockup />
        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => {
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <li key={n.href}>
                  <Link href={n.href} aria-current={active ? "page" : undefined} className={`rounded-full px-3 py-2 text-sm font-bold transition-colors hover:bg-celeste-50 ${active ? "bg-celeste text-marino" : "text-tinta-suave"}`}>
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          <Link href="/carrito" className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-marino hover:bg-celeste-50" aria-label={`Carrito${ready && count ? `, ${count} artículo${count === 1 ? "" : "s"}` : ", vacío"}`}>
            <Icon name="cart" className="h-6 w-6" />
            {ready && count > 0 ? <span className="absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-naranja px-1 text-xs font-extrabold text-marino">{count}</span> : null}
          </Link>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-marino hover:bg-celeste-50 lg:hidden" aria-expanded={open} aria-controls="menu-movil" onClick={() => setOpen((v) => !v)}>
            <Icon name={open ? "close" : "menu"} className="h-6 w-6" />
            <span className="sr-only">{open ? "Cerrar menú" : "Abrir menú"}</span>
          </button>
        </div>
      </div>
      {open ? (
        <nav id="menu-movil" aria-label="Menú" className="border-t border-borde/60 bg-white lg:hidden">
          <ul className="container-page grid gap-1 py-3">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="flex min-h-12 items-center justify-between rounded-xl px-3 text-base font-bold text-marino hover:bg-celeste-50">
                  {n.label}
                  <Icon name="chevron" className="h-4 w-4 text-tinta-suave" />
                </Link>
              </li>
            ))}
            <li>
              <Link href="/pedido" className="flex min-h-12 items-center justify-between rounded-xl px-3 text-base font-bold text-marino hover:bg-celeste-50">
                Consultar mi pedido
                <Icon name="chevron" className="h-4 w-4 text-tinta-suave" />
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
