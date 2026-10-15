import "server-only";
import { z } from "zod";

/**
 * Variables de entorno del servidor. Los secretos solo viven aquí: nunca se
 * exponen con NEXT_PUBLIC_ ni se envían al navegador.
 */
const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Entorno de la aplicación (separa pruebas de producción en datos y métricas). */
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://rincel:rincel_dev@localhost:5432/rincel_dev"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),

  PAYMENT_PROVIDER: z.enum(["mercadopago", "simulated", "none"]).default("none"),
  MP_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  /** ID de usuario de la cuenta de Mercado Pago que debe recibir los pagos. */
  MP_USER_ID: z.string().optional(),
  MP_API_BASE: z.url().default("https://api.mercadopago.com"),
  /** Candado adicional: los cobros reales solo se habilitan con "true". */
  PAYMENTS_LIVE_ENABLED: boolish,

  SHIPPING_PROVIDER: z.enum(["none", "manual", "simulated"]).default("none"),

  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  STORAGE_DIR: z.string().default("./storage"),
  CRON_SECRET: z.string().min(24).optional(),

  GA4_MEASUREMENT_ID: z.string().optional(),
  GA4_API_SECRET: z.string().optional(),
  META_PIXEL_ID: z.string().optional(),
  META_CAPI_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // No imprimimos valores, solo los nombres de las variables con problemas.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuración de entorno inválida: ${names}`);
  }
  const e = parsed.data;
  if (e.APP_ENV === "production") {
    if (e.PAYMENT_PROVIDER === "simulated") throw new Error("El proveedor de pagos simulado no puede usarse en producción.");
    if (e.SHIPPING_PROVIDER === "simulated") throw new Error("Las tarifas de envío simuladas no pueden usarse en producción.");
    if (!e.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET es obligatorio en producción.");
  }
  cached = e;
  return e;
}

/** Solo para pruebas: fuerza a releer process.env. */
export function resetEnvCache() {
  cached = null;
}

export const isProductionApp = () => env().APP_ENV === "production";

/** Un pedido es de prueba si no se cobra con credenciales productivas. */
export function paymentEnvironment(): "simulated" | "sandbox" | "production" | "none" {
  const e = env();
  if (e.PAYMENT_PROVIDER === "simulated") return "simulated";
  if (e.PAYMENT_PROVIDER === "none") return "none";
  return e.MP_ENVIRONMENT;
}
