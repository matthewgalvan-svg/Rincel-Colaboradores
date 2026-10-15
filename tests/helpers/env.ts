/** Entorno de pruebas aislado. Debe cargarse antes de importar módulos de la app. */
const url = process.env.VITEST_DATABASE_URL ?? "postgres://rincel:rincel_dev@localhost:5432/rincel_vitest";
Object.assign(process.env, {
  NODE_ENV: "test",
  APP_ENV: "test",
  APP_URL: "http://localhost:3999",
  DATABASE_URL: url,
  BETTER_AUTH_SECRET: "vitest-secret-0123456789abcdef0123456789abcdef",
  PAYMENT_PROVIDER: "simulated",
  SHIPPING_PROVIDER: "simulated",
  MP_USER_ID: "123456789",
  STORAGE_DIR: "./storage-test/vitest",
  RATE_LIMIT_IN_TESTS: "0",
});
