import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/db";
import { settings } from "@/db/schema";

/**
 * Configuración editable desde el panel. Nada aquí es secreto: credenciales
 * y llaves viven solo en variables de entorno.
 */
export const storeSettingsSchema = z.object({
  sellerName: z.string().min(2).max(80),
  contact: z.object({
    /** Número de WhatsApp en formato internacional sin "+" (p. ej. 5281XXXXXXXX). Vacío = no mostrar. */
    whatsappNumber: z.string().regex(/^\d{10,15}$/).nullable(),
    whatsappMessage: z.string().max(300),
    email: z.email().nullable(),
    phone: z.string().max(30).nullable(),
    hours: z.string().max(120).nullable(),
  }),
  home: z.object({
    heroTitle: z.string().min(3).max(80),
    heroSubtitle: z.string().max(220),
    primaryCta: z.string().min(2).max(40),
    secondaryCta: z.string().min(2).max(40),
  }),
  announcement: z.object({
    enabled: z.boolean(),
    text: z.string().max(160),
    href: z.string().max(200).nullable(),
  }),
  shipping: z.object({
    /** Alternativa manual explícita: tarifa fija configurada por el negocio (sin fingir cotización automática). */
    manual: z.object({
      enabled: z.boolean(),
      label: z.string().min(3).max(80),
      costCents: z.number().int().min(0).max(1_000_000),
      estimatedDays: z.string().max(60),
      description: z.string().max(240),
    }),
    /** Crear guía automáticamente al aprobarse el pago (solo con proveedor real). */
    autoCreateLabels: z.boolean(),
    quoteTtlMinutes: z.number().int().min(5).max(24 * 60),
    origin: z
      .object({
        name: z.string(),
        phone: z.string(),
        postalCode: z.string(),
        state: z.string(),
        municipality: z.string(),
        neighborhood: z.string(),
        street: z.string(),
        exteriorNumber: z.string(),
      })
      .nullable(),
    /** Empaque adicional por envío (caja/sobre), en gramos. null = por configurar. */
    packagingWeightGrams: z.number().int().min(0).nullable(),
  }),
  checkout: z.object({
    /** Minutos que se apartan existencias para un pago pendiente con tarjeta. */
    reservationMinutes: z.number().int().min(10).max(24 * 60),
    /** Máximo de horas que se aparta inventario para pagos en efectivo/SPEI pendientes. */
    pendingPaymentMaxHours: z.number().int().min(1).max(24 * 10),
    maxQuantityPerItem: z.number().int().min(1).max(50),
  }),
});

export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const DEFAULT_SETTINGS: StoreSettings = {
  sellerName: "Rincel Colaboradores",
  contact: {
    whatsappNumber: null,
    whatsappMessage: "Hola, tengo una duda sobre Rincel Colaboradores.",
    email: null,
    phone: null,
    hours: null,
  },
  home: {
    heroTitle: "Conéctate a lo que importa",
    heroSubtitle: "Planes con portabilidad, líneas nuevas, chips de datos e internet portátil. Elige, paga en línea y te acompañamos en la activación.",
    primaryCta: "Encuentra tu plan",
    secondaryCta: "Conserva tu número",
  },
  announcement: { enabled: false, text: "", href: null },
  shipping: {
    manual: {
      enabled: false,
      label: "Envío nacional",
      costCents: 0,
      estimatedDays: "",
      description: "Guía generada manualmente por nuestro equipo después del pago.",
    },
    autoCreateLabels: false,
    quoteTtlMinutes: 30,
    origin: null,
    packagingWeightGrams: null,
  },
  checkout: {
    reservationMinutes: 60,
    pendingPaymentMaxHours: 72,
    maxQuantityPerItem: 10,
  },
};

const KEY = "store";

export async function getSettings(tx: DbOrTx = db): Promise<StoreSettings> {
  const rows = await tx.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!rows[0]) return DEFAULT_SETTINGS;
  const merged = deepMerge(DEFAULT_SETTINGS, rows[0].value as Partial<StoreSettings>);
  const parsed = storeSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(value: StoreSettings, userId: string | null, tx: DbOrTx = db): Promise<StoreSettings> {
  const parsed = storeSettingsSchema.parse(value);
  await tx
    .insert(settings)
    .values({ key: KEY, value: parsed, updatedBy: userId })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedBy: userId, updatedAt: new Date() } });
  return parsed;
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return (patch ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v) ? deepMerge(b, v) : v;
  }
  return out as T;
}

/** Datos públicos de contacto (seguros para el navegador). */
export function publicContact(s: StoreSettings) {
  const wa = s.contact.whatsappNumber ? `https://wa.me/${s.contact.whatsappNumber}?text=${encodeURIComponent(s.contact.whatsappMessage)}` : null;
  return { whatsappUrl: wa, email: s.contact.email, phone: s.contact.phone, hours: s.contact.hours };
}
