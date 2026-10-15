import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/domain/types";
import { auth } from "./index";

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Permisos verificados en servidor. El personal de pedidos opera pedidos,
 * envíos y activaciones; solo un administrador cambia precios, inventario,
 * configuración, usuarios y reembolsos.
 */
export const PERMISSIONS = {
  "orders.read": ["admin", "staff"],
  "orders.update": ["admin", "staff"],
  "orders.export": ["admin"],
  "shipments.manage": ["admin", "staff"],
  "activations.manage": ["admin", "staff"],
  "support.manage": ["admin", "staff"],
  "refunds.request": ["admin", "staff"],
  "refunds.execute": ["admin"],
  "products.manage": ["admin"],
  "inventory.manage": ["admin"],
  "settings.manage": ["admin"],
  "users.manage": ["admin"],
  "audit.read": ["admin"],
  "stats.read": ["admin", "staff"],
  "customers.pii": ["admin", "staff"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(user: Pick<StaffUser, "role"> | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(user.role);
}

function toStaffUser(session: Awaited<ReturnType<typeof auth.api.getSession>>): StaffUser | null {
  if (!session?.user) return null;
  const u = session.user as typeof session.user & { role?: string | null; banned?: boolean | null };
  if (u.banned) return null;
  const role: UserRole | null = u.role === "admin" ? "admin" : u.role === "staff" ? "staff" : null;
  if (!role) return null;
  return { id: u.id, email: u.email, name: u.name, role };
}

export async function getStaffUser(): Promise<StaffUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return toStaffUser(session);
}

/** Para páginas del panel: redirige al acceso si no hay sesión válida. */
export async function requireStaffPage(permission?: Permission): Promise<StaffUser> {
  const user = await getStaffUser();
  if (!user) redirect("/admin/acceso");
  if (permission && !can(user, permission)) redirect("/admin?error=permiso");
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para esta acción.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Para acciones de servidor y rutas API: lanza error en lugar de redirigir. */
export async function requirePermission(permission: Permission): Promise<StaffUser> {
  const user = await getStaffUser();
  if (!user) throw new ForbiddenError("Sesión no válida.");
  if (!can(user, permission)) throw new ForbiddenError();
  return user;
}
