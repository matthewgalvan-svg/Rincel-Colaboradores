import { describe, expect, it } from "vitest";
import { centsToDecimalString, decimalToCents, formatMXN } from "@/lib/money";
import { generateOrderNumber } from "@/lib/security/tokens";

describe("Dinero", () => {
  it("convierte entre centavos y decimales exactos", () => {
    expect(centsToDecimalString(105000)).toBe("1050.00");
    expect(centsToDecimalString(23005)).toBe("230.05");
    expect(decimalToCents("1050.1")).toBe(105010);
    expect(decimalToCents("0.29")).toBe(29);
    expect(decimalToCents("abc")).toBeNull();
    expect(() => centsToDecimalString(1.5)).toThrow();
  });
  it("formatea en pesos mexicanos", () => {
    expect(formatMXN(105000)).toBe("$1,050");
    expect(formatMXN(23050)).toBe("$230.50");
  });
});

describe("Número de pedido", () => {
  it("es legible, sin caracteres ambiguos y con baja probabilidad de colisión", () => {
    const n = generateOrderNumber(new Date("2026-10-15T12:00:00Z"));
    expect(n).toMatch(/^RC-2610-[2-9A-HJKMNP-Z]{5}$/);
    const set = new Set(Array.from({ length: 2000 }, () => generateOrderNumber()));
    expect(set.size).toBeGreaterThan(1990);
  });
});

/** Contraste WCAG con los colores oficiales de la paleta. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("Contraste de la paleta oficial", () => {
  const P = { celeste: "#D0E5F6", morado: "#4D2C85", naranja: "#F4A61D", azul: "#1E76BA", marino: "#212044", turquesa: "#4EC2D1", blanco: "#FFFFFF" };
  it("combinaciones usadas para texto cumplen AA (≥ 4.5:1)", () => {
    expect(contrast(P.marino, P.blanco)).toBeGreaterThan(4.5);
    expect(contrast(P.marino, P.celeste)).toBeGreaterThan(4.5);
    expect(contrast(P.marino, P.naranja)).toBeGreaterThan(4.5); // botón principal
    expect(contrast(P.morado, P.blanco)).toBeGreaterThan(4.5);
    expect(contrast(P.blanco, P.marino)).toBeGreaterThan(4.5);
    expect(contrast(P.marino, P.turquesa)).toBeGreaterThan(4.5);
    expect(contrast(P.azul, P.blanco)).toBeGreaterThan(4.5);
  });
  it("texto blanco sobre naranja NO es legible (por eso no se usa)", () => {
    expect(contrast(P.blanco, P.naranja)).toBeLessThan(3);
  });
});
