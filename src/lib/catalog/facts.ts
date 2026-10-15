import { createHash } from "node:crypto";

export interface CommercialFacts {
  priceCents: number;
  dataGb: number | null;
  validityDays: number | null;
  socialDataGb: number | null;
  socialUnlimited: boolean;
  linesPerUnit: number;
}

/**
 * Huella de los datos comerciales que aparecen impresos en el cartel. Si el
 * precio o un beneficio cambia, la huella deja de coincidir con la que se
 * guardó al validar la imagen y el cartel deja de publicarse hasta que se
 * reemplace o se apruebe de nuevo.
 */
export function commercialFactsHash(f: CommercialFacts): string {
  const canonical = JSON.stringify([f.priceCents, f.dataGb ?? null, f.validityDays ?? null, f.socialDataGb ?? null, Boolean(f.socialUnlimited), f.linesPerUnit]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export interface ImageFields extends CommercialFacts {
  imagePath: string | null;
  imageAlt: string;
  imageFactsHash: string | null;
  imageReviewRequired: boolean;
  altImagePath: string | null;
  altImageAlt: string | null;
}

export type ImageState = "ok" | "outdated" | "review_required" | "missing";

export function commercialImageState(p: ImageFields): ImageState {
  if (!p.imagePath) return "missing";
  if (p.imageReviewRequired) return "review_required";
  if (!p.imageFactsHash || p.imageFactsHash !== commercialFactsHash(p)) return "outdated";
  return "ok";
}

/** Imagen que puede mostrarse públicamente (o null si ninguna es segura). */
export function publicImage(p: ImageFields): { src: string; alt: string; commercial: boolean } | null {
  if (commercialImageState(p) === "ok" && p.imagePath) return { src: p.imagePath, alt: p.imageAlt, commercial: true };
  if (p.altImagePath) return { src: p.altImagePath, alt: p.altImageAlt ?? "", commercial: false };
  return null;
}
