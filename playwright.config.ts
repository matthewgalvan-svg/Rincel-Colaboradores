import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de extremo a extremo contra la app en modo desarrollo con pagos y
 * envíos SIMULADOS (nunca credenciales reales). Requiere la base de pruebas
 * migrada y con catálogo (ver README → Pruebas).
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: "movil", use: { ...devices["Pixel 7"], launchOptions: executablePath ? { executablePath } : undefined } },
    { name: "escritorio", use: { ...devices["Desktop Chrome"], launchOptions: executablePath ? { executablePath } : undefined } },
  ],
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      APP_ENV: "test",
      APP_URL: `http://localhost:${port}`,
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://rincel:rincel_dev@localhost:5432/rincel_test",
      BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
      PAYMENT_PROVIDER: "simulated",
      SHIPPING_PROVIDER: "simulated",
      STORAGE_DIR: "./storage-test",
      AUTH_RATE_LIMIT_DISABLED: "1",
    },
  },
});
