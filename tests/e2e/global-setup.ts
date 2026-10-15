import { spawnSync } from "node:child_process";

/** Crea (si no existen) las cuentas de prueba del panel en la base e2e. */
export default function globalSetup() {
  const base = {
    ...process.env,
    APP_ENV: "test",
    DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://rincel:rincel_dev@localhost:5432/rincel_test",
    BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
  };
  for (const u of [
    { ADMIN_EMAIL: "admin@rincel.local", ADMIN_NAME: "Admin Pruebas", ADMIN_PASSWORD: "dev-admin-password-123", ADMIN_ROLE: "admin" },
    { ADMIN_EMAIL: "staff@rincel.local", ADMIN_NAME: "Personal Pruebas", ADMIN_PASSWORD: "dev-staff-password-123", ADMIN_ROLE: "staff" },
  ]) {
    // Si ya existe, el script termina con error controlado: se ignora.
    spawnSync("npx", ["tsx", "--conditions=react-server", "scripts/create-admin.ts"], { env: { ...base, ...u }, stdio: "ignore" });
  }
}
