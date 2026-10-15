import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commercialFactsHash, commercialImageState, publicImage } from "@/lib/catalog/facts";
import { keyFacts } from "@/lib/catalog/format";
import { SEED_PRODUCTS } from "@/lib/catalog/seed-data";
import { toPublicProduct } from "@/lib/catalog/queries";

const base = JSON.parse(readFileSync(path.join(process.cwd(), "assets-rincel/catalogo-base.json"), "utf8")) as {
  products: { id: string; price_mxn: number; data_gb: number | null; validity_days: number | null; social_data_gb: number | null; image: string; image_review_required: boolean }[];
};

describe("Catálogo base", () => {
  it("son exactamente los 13 productos definidos (no se inventa el 14)", () => {
    expect(SEED_PRODUCTS).toHaveLength(13);
    expect(base.products).toHaveLength(13);
    expect(new Set(SEED_PRODUCTS.map((p) => p.id))).toEqual(new Set(base.products.map((p) => p.id)));
  });

  it("precios, GB, vigencias y bolsas coinciden con catalogo-base.json (null ≠ 0)", () => {
    for (const b of base.products) {
      const p = SEED_PRODUCTS.find((x) => x.id === b.id)!;
      expect(p.priceCents, b.id).toBe(b.price_mxn * 100);
      expect(p.dataGb, b.id).toBe(b.data_gb);
      expect(p.validityDays, b.id).toBe(b.validity_days);
      expect(p.socialDataGb, b.id).toBe(b.social_data_gb);
      expect(p.imageReviewRequired, b.id).toBe(b.image_review_required);
    }
  });

  it("cada producto usa su imagen exacta del mapa", () => {
    for (const b of base.products) {
      const p = SEED_PRODUCTS.find((x) => x.id === b.id)!;
      expect(p.imagePath).toBe(`/productos/${path.basename(b.image).replace(/\.jpg$/, ".webp")}`);
    }
  });

  it("2×1: $230 por dos líneas, sin GB ni vigencia inferidos y con la nota obligatoria", () => {
    const p = SEED_PRODUCTS.find((x) => x.id === "rino-230-portabilidad-2x1")!;
    expect(p.priceCents).toBe(23000);
    expect(p.linesPerUnit).toBe(2);
    expect(p.dataGb).toBeNull();
    expect(p.validityDays).toBeNull();
    expect(p.priceNote).toBe("$230 por las dos líneas en el primer pago. Después, cada línea se recarga por separado.");
    expect(p.ctaLabel).toBe("Comprar dos líneas por $230");
    expect(p.variants.find((v) => v.code === "fisico")?.components).toEqual([{ componentId: "sim-rincel", quantity: 2 }]);
  });

  it("eSIM solo en el 2×1; kit = 12 chips; chips de datos no incluyen MiFi ni son ilimitados", () => {
    const esim = SEED_PRODUCTS.filter((p) => p.variants.some((v) => v.simType === "esim")).map((p) => p.id);
    expect(esim).toEqual(["rino-230-portabilidad-2x1"]);
    const kit = SEED_PRODUCTS.find((p) => p.id === "kit-colaborador")!;
    expect(kit.variants[0].components).toContainEqual({ componentId: "sim-rincel", quantity: 12 });
    expect(kit.conditions.join(" ")).toMatch(/No incluye saldo, planes activados, ingresos ni comisiones/);
    for (const p of SEED_PRODUCTS.filter((x) => x.category === "datos")) {
      expect(p.socialUnlimited).toBe(false);
      expect(p.requirements.join(" ")).toMatch(/No incluye equipo MiFi/);
      expect(keyFacts(p).map((f) => f.label)).toContain("bolsa aparte para redes");
    }
  });

  it("MiFi: no publica 'hasta 10 dispositivos'; usa la imagen alterna y no inventa velocidad ni conexiones", () => {
    const m = SEED_PRODUCTS.find((p) => p.id === "mifi-rincel")!;
    expect(m.imageReviewRequired).toBe(true);
    expect(m.altImagePath).toBe("/productos/mifi-rincel-sin-texto.webp");
    const publicText = [m.description, m.tagline, ...m.features, ...m.conditions, ...m.requirements].join(" ");
    expect(publicText).not.toMatch(/10 dispositivos|8 dispositivos|Mbps|horas de batería/i);
    expect(publicText).toMatch(/SATCO F-02/);
  });
});

describe("Imágenes comerciales desactualizadas", () => {
  const p = SEED_PRODUCTS.find((x) => x.id === "rino-150-portabilidad")!;
  const fields = { ...p, imageFactsHash: commercialFactsHash(p) };

  it("si cambia el precio o un beneficio, el cartel deja de publicarse", () => {
    expect(commercialImageState(fields)).toBe("ok");
    const changed = { ...fields, priceCents: 16000 };
    expect(commercialImageState(changed)).toBe("outdated");
    expect(publicImage(changed)).toBeNull();
    const gb = { ...fields, dataGb: 15 };
    expect(commercialImageState(gb)).toBe("outdated");
  });

  it("el producto público nunca incluye pendientes internos", () => {
    const row = { ...p, imageFactsHash: commercialFactsHash(p), seoTitle: null, createdAt: new Date(), updatedAt: new Date() } as never;
    const pub = toPublicProduct(row, [], new Map());
    expect(JSON.stringify(pub)).not.toMatch(/Confirmar/);
    expect(Object.keys(pub)).not.toContain("internalPending");
  });
});
