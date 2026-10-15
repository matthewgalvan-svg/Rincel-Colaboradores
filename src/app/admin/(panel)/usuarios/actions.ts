"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/components/admin/ActionForm";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { ForbiddenError, requirePermission } from "@/lib/auth/guard";

function fail(err: unknown): ActionResult {
  if (err instanceof ForbiddenError) return { ok: false, message: err.message };
  if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Datos inválidos." };
  const msg = (err as { body?: { message?: string } })?.body?.message ?? (err instanceof Error ? err.message : "Error");
  return { ok: false, message: msg };
}

export async function createUserAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("users.manage");
    const data = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.email(),
        role: z.enum(["admin", "staff"]),
        password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres.").max(128),
      })
      .parse(Object.fromEntries(form));
    await auth.api.createUser({ body: { email: data.email.toLowerCase(), name: data.name, password: data.password, role: data.role }, headers: await headers() });
    await audit({ actor: user, action: "usuario.creado", entity: "user", entityId: data.email, after: { role: data.role } });
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Cuenta creada. Comparte la contraseña temporal por un canal seguro." };
  } catch (err) {
    return fail(err);
  }
}

export async function setRoleAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("users.manage");
    const userId = z.string().min(1).parse(form.get("userId"));
    const role = z.enum(["admin", "staff"]).parse(form.get("role"));
    if (userId === user.id) throw new Error("No puedes cambiar tu propio rol.");
    await auth.api.setRole({ body: { userId, role }, headers: await headers() });
    await audit({ actor: user, action: "usuario.rol", entity: "user", entityId: userId, after: { role } });
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Rol actualizado." };
  } catch (err) {
    return fail(err);
  }
}

export async function banAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("users.manage");
    const userId = z.string().min(1).parse(form.get("userId"));
    const ban = form.get("ban") === "1";
    if (userId === user.id) throw new Error("No puedes desactivar tu propia cuenta.");
    if (ban) await auth.api.banUser({ body: { userId, banReason: "Desactivado desde el panel" }, headers: await headers() });
    else await auth.api.unbanUser({ body: { userId }, headers: await headers() });
    await audit({ actor: user, action: ban ? "usuario.desactivado" : "usuario.reactivado", entity: "user", entityId: userId });
    revalidatePath("/admin/usuarios");
    return { ok: true, message: ban ? "Cuenta desactivada y sesiones cerradas." : "Cuenta reactivada." };
  } catch (err) {
    return fail(err);
  }
}

export async function setPasswordAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission("users.manage");
    const userId = z.string().min(1).parse(form.get("userId"));
    const newPassword = z.string().min(12, "La contraseña debe tener al menos 12 caracteres.").max(128).parse(form.get("password"));
    await auth.api.setUserPassword({ body: { userId, newPassword }, headers: await headers() });
    await auth.api.revokeUserSessions({ body: { userId }, headers: await headers() });
    await audit({ actor: user, action: "usuario.contrasena_restablecida", entity: "user", entityId: userId });
    return { ok: true, message: "Contraseña restablecida; se cerraron sus sesiones." };
  } catch (err) {
    return fail(err);
  }
}
