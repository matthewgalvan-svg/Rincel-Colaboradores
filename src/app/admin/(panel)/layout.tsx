import { AdminNav, type NavItem } from "@/components/admin/AdminNav";
import { can, requireStaffPage } from "@/lib/auth/guard";
import { dashboardAlerts } from "@/lib/admin/queries";
import { env } from "@/lib/env";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaffPage();
  const alerts = await dashboardAlerts();
  const items: NavItem[] = [
    { href: "/admin", label: "Tablero", icon: "spark" },
    { href: "/admin/pedidos", label: "Pedidos", icon: "cart", badge: alerts.review + alerts.toPrepare || undefined },
    { href: "/admin/envios", label: "Envíos", icon: "truck", badge: alerts.failedLabels || undefined },
    { href: "/admin/activaciones", label: "Activaciones", icon: "phone", badge: alerts.pendingActivations || undefined },
    { href: "/admin/solicitudes", label: "Solicitudes", icon: "chat", badge: alerts.openSupport || undefined },
    { href: "/admin/estadisticas", label: "Estadísticas", icon: "info" },
  ];
  if (can(user, "products.manage")) items.push({ href: "/admin/productos", label: "Productos", icon: "chip", badge: alerts.imageIssues.length || undefined });
  if (can(user, "inventory.manage")) items.push({ href: "/admin/inventario", label: "Inventario", icon: "store", badge: alerts.lowStock.length || undefined });
  if (can(user, "settings.manage")) items.push({ href: "/admin/configuracion", label: "Configuración", icon: "shield" });
  if (can(user, "users.manage")) items.push({ href: "/admin/usuarios", label: "Usuarios", icon: "user" });
  if (can(user, "audit.read")) items.push({ href: "/admin/auditoria", label: "Auditoría", icon: "clock" });
  const e = env();
  return (
    <div className="lg:flex">
      <AdminNav items={items} user={user} />
      <div className="min-w-0 flex-1">
        {e.APP_ENV !== "production" ? <div className="bg-[#fff6e5] px-4 py-1.5 text-center text-xs font-bold text-alerta">Entorno {e.APP_ENV} · pagos: {e.PAYMENT_PROVIDER} · envíos: {e.SHIPPING_PROVIDER}</div> : null}
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
