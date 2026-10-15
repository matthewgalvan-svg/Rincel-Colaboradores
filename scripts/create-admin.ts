/**
 * Crea una cuenta del panel. La contraseña se pide por variable de entorno
 * para no dejarla en el historial de la terminal.
 *
 *   ADMIN_EMAIL=persona@dominio.mx ADMIN_NAME="Nombre" ADMIN_PASSWORD='...' ADMIN_ROLE=admin npm run admin:create
 */
import { closeDb } from "@/db";
import { auth } from "@/lib/auth";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME ?? "Administrador";
  const password = process.env.ADMIN_PASSWORD;
  const role = (process.env.ADMIN_ROLE ?? "admin") as "admin" | "staff";
  if (!email || !password) throw new Error("Define ADMIN_EMAIL y ADMIN_PASSWORD.");
  if (password.length < 12) throw new Error("La contraseña debe tener al menos 12 caracteres.");
  if (!["admin", "staff"].includes(role)) throw new Error("ADMIN_ROLE debe ser admin o staff.");
  await auth.api.createUser({ body: { email, name, password, role } });
  console.log(`Cuenta creada: ${email} (${role}).`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});
