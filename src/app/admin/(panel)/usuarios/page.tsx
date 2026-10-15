import { ActionForm } from "@/components/admin/ActionForm";
import { Field, PageHeader, Panel, inputCls } from "@/components/admin/ui";
import { staffUsers } from "@/lib/admin/queries";
import { requireStaffPage } from "@/lib/auth/guard";
import { formatDate } from "@/lib/money";
import { banAction, createUserAction, setPasswordAction, setRoleAction } from "./actions";

export const metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  const me = await requireStaffPage("users.manage");
  const users = await staffUsers();
  return (
    <>
      <PageHeader title="Usuarios del panel" description="Administrador: todo. Personal de pedidos: pedidos, envíos, activaciones, solicitudes y estadísticas; sin precios, inventario, configuración, usuarios ni ejecución de reembolsos." />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-3">
          {users.map((u) => (
            <Panel key={u.id}>
              <p className="font-extrabold text-marino">
                {u.name} {u.id === me.id ? <span className="text-xs text-tinta-suave">(tú)</span> : null}
              </p>
              <p className="text-sm text-tinta-suave">
                {u.email} · {u.role === "admin" ? "Administrador" : "Personal de pedidos"} · desde {formatDate(u.createdAt)} {u.banned ? "· DESACTIVADO" : ""}
              </p>
              {u.id !== me.id ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <ActionForm action={setRoleAction} submitLabel="Cambiar rol" variant="secondary">
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role ?? "staff"} className={inputCls} aria-label="Rol">
                      <option value="staff">Personal de pedidos</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </ActionForm>
                  <ActionForm action={setPasswordAction} submitLabel="Restablecer contraseña" variant="secondary">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="password" name="password" className={inputCls} placeholder="Nueva (mín. 12)" autoComplete="new-password" aria-label="Nueva contraseña" />
                  </ActionForm>
                  <ActionForm action={banAction} submitLabel={u.banned ? "Reactivar" : "Desactivar"} variant={u.banned ? "secondary" : "danger"} confirm={u.banned ? undefined : "¿Desactivar esta cuenta y cerrar sus sesiones?"}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="ban" value={u.banned ? "0" : "1"} />
                  </ActionForm>
                </div>
              ) : null}
            </Panel>
          ))}
        </div>
        <Panel title="Nueva cuenta">
          <ActionForm action={createUserAction} submitLabel="Crear cuenta">
            <Field label="Nombre">
              <input name="name" className={inputCls} required />
            </Field>
            <Field label="Correo">
              <input name="email" type="email" className={inputCls} required />
            </Field>
            <Field label="Rol">
              <select name="role" className={inputCls}>
                <option value="staff">Personal de pedidos</option>
                <option value="admin">Administrador</option>
              </select>
            </Field>
            <Field label="Contraseña temporal" hint="Mínimo 12 caracteres. Compártela por un canal seguro.">
              <input name="password" type="password" className={inputCls} required minLength={12} autoComplete="new-password" />
            </Field>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
