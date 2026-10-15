import { expect, test } from "@playwright/test";

/** Flujo completo de compra con pasarela y paquetería simuladas. */
test.describe("Compra", () => {
  test("chip físico con envío: cotización, pago aprobado y comprobante", async ({ page }) => {
    await page.goto("/producto/rino-150-portabilidad", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: /Rino 150/ })).toBeVisible();
    // Precio, vigencia y tipo de plan legibles en HTML (no solo en el cartel).
    await expect(page.getByText("Conservas").first()).toBeVisible();
    await page.getByRole("button", { name: "Elegir este plan" }).first().click();
    await expect(page).toHaveURL(/\/carrito$/);
    await expect(page.getByRole("link", { name: "Rino 150 — Portabilidad" })).toBeVisible();
    await expect(page).toHaveURL(/\/carrito$/);
    await page.getByRole("link", { name: "Continuar con mi compra" }).click();

    await page.getByLabel("Nombre completo").fill("Cliente Prueba");
    await page.getByLabel("Correo electrónico").fill("cliente@example.com");
    await page.getByLabel("Teléfono (10 dígitos)").fill("8112345678");
    await page.getByLabel("Código postal").fill("64000");
    await page.getByLabel("Estado").selectOption("Nuevo León");
    await page.getByLabel("Municipio o alcaldía").fill("Monterrey");
    await page.getByLabel("Colonia").fill("Centro");
    await page.getByLabel("Calle", { exact: true }).fill("Av. Juárez");
    await page.getByLabel("Número exterior").fill("100");
    await page.getByRole("button", { name: "Cotizar envío" }).click();
    await expect(page.getByText("Estándar [SIMULADO]")).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Pagar con Mercado Pago" }).click();

    await expect(page).toHaveURL(/\/pago-simulado\//, { timeout: 45_000 });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Aprobar con tarjeta" }).click();
    await expect(page).toHaveURL(/\/checkout\/resultado/, { timeout: 45_000 });
    await expect(page.getByRole("heading", { name: "¡Pago aprobado!" })).toBeVisible();
    await page.getByRole("link", { name: "Ver comprobante" }).click();
    await expect(page.getByRole("heading", { name: "Comprobante de compra" })).toBeVisible();
    await expect(page.getByText("No es un CFDI")).toBeVisible();
  });

  test("2×1 eSIM: entrega digital sin envío y pago pendiente en efectivo", async ({ page }) => {
    await page.goto("/producto/rino-230-portabilidad-2x1", { waitUntil: "networkidle" });
    await expect(page.getByText("$230 por las dos líneas en el primer pago. Después, cada línea se recarga por separado.").first()).toBeVisible();
    await page.getByLabel(/2 eSIM/).check();
    await page.getByRole("button", { name: "Comprar dos líneas por $230" }).first().click();
    await expect(page).toHaveURL(/\/carrito$/);
    await page.getByRole("link", { name: "Continuar con mi compra" }).click();
    await expect(page.getByText("Dirección de entrega")).toHaveCount(0);
    await page.getByLabel("Nombre completo").fill("Cliente eSIM");
    await page.getByLabel("Correo electrónico").fill("esim@example.com");
    await page.getByLabel("Teléfono (10 dígitos)").fill("8187654321");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Pagar con Mercado Pago" }).click();
    await expect(page).toHaveURL(/\/pago-simulado\//, { timeout: 45_000 });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /efectivo/ }).click();
    await expect(page.getByRole("heading", { name: "Tu pago está en proceso" })).toBeVisible({ timeout: 45_000 });
    await page.getByRole("link", { name: "Ver mi pedido" }).click();
    await expect(page.getByText("Sin envío (entrega digital)")).toBeVisible();
  });

  test("errores conservan los datos capturados", async ({ page }) => {
    await page.goto("/producto/chip-datos-10gb-7dias", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Elegir este plan" }).first().click();
    await expect(page).toHaveURL(/\/carrito$/);
    await page.getByRole("link", { name: "Continuar con mi compra" }).click();
    await page.getByLabel("Nombre completo").fill("Persona Datos");
    await page.getByLabel("Correo electrónico").fill("correo-invalido");
    await page.getByRole("button", { name: "Pagar con Mercado Pago" }).click({ force: true });
    await expect(page.getByText("Escribe un correo válido.")).toBeVisible();
    await expect(page.getByLabel("Nombre completo")).toHaveValue("Persona Datos");
    await page.reload();
    await expect(page.getByLabel("Nombre completo")).toHaveValue("Persona Datos");
  });
});
