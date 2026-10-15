"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Icon, type IconName } from "@/components/ui/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}

export function AdminNav({ items, user }: { items: NavItem[]; user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const nav = (
    <ul className="grid gap-1">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} onClick={() => setOpen(false)} aria-current={isActive(i.href) ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold ${isActive(i.href) ? "bg-marino text-white" : "text-marino hover:bg-celeste-50"}`}>
            <Icon name={i.icon} className="h-5 w-5" />
            <span className="flex-1">{i.label}</span>
            {i.badge ? <span className="rounded-full bg-naranja px-2 py-0.5 text-xs font-extrabold text-marino">{i.badge}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <div className="flex items-center justify-between border-b border-borde/60 bg-white px-4 py-3 lg:hidden">
        <span className="font-extrabold text-marino">Panel</span>
        <button type="button" className="btn-secondary min-h-10 px-4 text-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>
      {open ? <nav className="border-b border-borde/60 bg-white p-3 lg:hidden">{nav}</nav> : null}
      <aside className="hidden w-64 shrink-0 border-r border-borde/60 bg-white p-4 lg:block">
        <p className="px-3 pb-3 text-xs font-bold tracking-wide text-tinta-suave uppercase">Rincel Colaboradores</p>
        <nav aria-label="Panel">{nav}</nav>
        <div className="mt-6 border-t border-borde/60 px-3 pt-4 text-sm">
          <p className="font-bold text-marino">{user.name}</p>
          <p className="text-xs text-tinta-suave">
            {user.email} · {user.role === "admin" ? "Administrador" : "Personal de pedidos"}
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-bold text-morado underline"
            onClick={async () => {
              await authClient.signOut();
              window.location.assign("/admin/acceso");
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
