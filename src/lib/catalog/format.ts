import type { ProductCategory } from "@/lib/domain/types";

export interface FactInput {
  id: string;
  category: ProductCategory;
  dataGb: number | null;
  validityDays: number | null;
  socialDataGb: number | null;
  socialUnlimited: boolean;
  linesPerUnit: number;
}

export interface Fact {
  value: string;
  label: string;
}

const gb = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} GB`;

/** Datos clave para entender el producto en segundos (sin inventar los pendientes). */
export function keyFacts(p: FactInput): Fact[] {
  switch (p.category) {
    case "portabilidad":
      if (p.linesPerUnit === 2) {
        return [
          { value: "2 líneas", label: "en un solo pago" },
          { value: "Físico o eSIM", label: "tú eliges" },
          { value: "Conservas", label: "cada número" },
        ];
      }
      return [
        ...(p.dataGb !== null ? [{ value: gb(p.dataGb), label: "con promoción de portabilidad" }] : []),
        ...(p.validityDays !== null ? [{ value: `${p.validityDays} días`, label: "de vigencia" }] : []),
        { value: "Conservas", label: "tu número" },
      ];
    case "linea_nueva":
      return [
        ...(p.dataGb !== null ? [{ value: gb(p.dataGb), label: "para navegar" }] : []),
        ...(p.validityDays !== null ? [{ value: `${p.validityDays} días`, label: "de vigencia" }] : []),
        { value: "Nuevo", label: "número" },
      ];
    case "datos":
      return [
        ...(p.dataGb !== null ? [{ value: gb(p.dataGb), label: "para navegar" }] : []),
        ...(p.socialDataGb !== null ? [{ value: `+${gb(p.socialDataGb)}`, label: "bolsa aparte para redes" }] : []),
        ...(p.validityDays !== null ? [{ value: `${p.validityDays} días`, label: "de vigencia" }] : []),
      ];
    case "equipo":
      return [
        { value: "4G LTE", label: "módem portátil" },
        { value: "Wi-Fi", label: "comparte internet" },
        { value: "Prepago", label: "por recargas de datos" },
      ];
    case "kit":
      return [
        { value: "12 chips", label: "Rincel" },
        { value: "Volantes", label: "de apoyo para venta" },
        { value: "Soporte", label: "para activar líneas" },
      ];
  }
}

export function categoryPath(c: ProductCategory) {
  return { portabilidad: "/planes/portabilidad", linea_nueva: "/planes/linea-nueva", datos: "/planes/chips-datos", equipo: "/planes/mifi", kit: "/planes/kit-colaborador" }[c];
}
