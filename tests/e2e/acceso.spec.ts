import { expect, test } from "@playwright/test";

test.describe("Acceso y permisos", () => {
  test("sin sesión, el panel redirige al acceso y las rutas privadas responden 403", async ({ page, request }) => {
    await page.goto("/admin/pedidos");
    await expect(page).toHaveURL(/\/admin\/acceso$/);
    const csv = await request.get("/api/admin/pedidos/export");
    expect(csv.status()).toBe(403);
    const file = await request.get("/api/admin/archivos/00000000-0000-0000-0000-000000000000");
    expect(file.status()).toBe(403);
  });

  test("un número de pedido sin token no muestra datos", async ({ page }) => {
    await page.goto("/pedido/RC-2610-AAAAA");
    await expect(page.getByRole("heading", { name: "No pudimos abrir este pedido" })).toBeVisible();
  });

  test("el personal de pedidos no puede entrar a productos ni usuarios", async ({ page }) => {
    await page.goto("/admin/acceso", { waitUntil: "networkidle" });
    await page.getByLabel("Correo").fill("staff@rincel.local");
    await page.getByLabel("Contraseña").fill("dev-staff-password-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin$/, { timeout: 45_000 });
    await expect(page.getByRole("link", { name: /Productos/ })).toHaveCount(0);
    await page.goto("/admin/productos");
    await expect(page).toHaveURL(/error=permiso/);
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(/error=permiso/);
  });

  test("un administrador ve pedidos y puede abrir el detalle", async ({ page }) => {
    await page.goto("/admin/acceso", { waitUntil: "networkidle" });
    await page.getByLabel("Correo").fill("admin@rincel.local");
    await page.getByLabel("Contraseña").fill("dev-admin-password-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin$/, { timeout: 45_000 });
    await page.goto("/admin/pedidos?pruebas=1", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible();
    await page.goto("/admin/productos", { waitUntil: "networkidle" });
    await expect(page.getByText("MiFi Rincel — Internet portátil")).toBeVisible();
    await expect(page.getByText("Imagen en revisión (oculta)")).toBeVisible();
  });

  test("contraseña incorrecta no entra", async ({ page }) => {
    await page.goto("/admin/acceso", { waitUntil: "networkidle" });
    await page.getByLabel("Correo").fill("admin@rincel.local");
    await page.getByLabel("Contraseña").fill("incorrecta-123456");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText(/Correo o contraseña incorrectos|Demasiados intentos/)).toBeVisible();
  });
});
