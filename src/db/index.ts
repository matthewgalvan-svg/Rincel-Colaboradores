import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** Transacción o conexión: los servicios aceptan cualquiera de las dos. */
export type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __rincelPool?: Pool; __rincelDb?: Database };

function connectionString() {
  return process.env.DATABASE_URL ?? "postgres://rincel:rincel_dev@localhost:5432/rincel_dev";
}

export function getPool(): Pool {
  if (!globalForDb.__rincelPool) {
    globalForDb.__rincelPool = new Pool({
      connectionString: connectionString(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      // Fechas en UTC dentro de la base; la presentación usa America/Monterrey.
      options: "-c timezone=UTC",
    });
  }
  return globalForDb.__rincelPool;
}

export function getDb(): Database {
  if (!globalForDb.__rincelDb) {
    globalForDb.__rincelDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__rincelDb;
}

/** El pool no abre conexiones hasta la primera consulta. */
export const db: Database = getDb();

export async function closeDb() {
  if (globalForDb.__rincelPool) {
    await globalForDb.__rincelPool.end();
    globalForDb.__rincelPool = undefined;
    globalForDb.__rincelDb = undefined;
  }
}

export { schema };
