import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Recrea el esquema de la base de pruebas y aplica las migraciones reales. */
export default async function setup() {
  const url = process.env.VITEST_DATABASE_URL ?? "postgres://rincel:rincel_dev@localhost:5432/rincel_vitest";
  if (!/vitest|test/.test(url)) throw new Error("La URL de base de pruebas debe apuntar a una base de pruebas.");
  const pool = new Pool({ connectionString: url });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
