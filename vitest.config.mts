import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Pruebas unitarias y de integración contra una base PostgreSQL de pruebas
 * dedicada (VITEST_DATABASE_URL). Nunca usan credenciales reales: Mercado
 * Pago se simula con un fetch en memoria y la paquetería con el proveedor simulado.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/helpers/global-setup.ts"],
    setupFiles: ["tests/helpers/env.ts"],
    fileParallelism: false,
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
