import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { adminAc, defaultAc } from "better-auth/plugins/admin/access";
import { db } from "@/db";
import { authAccount, authRateLimit, authSession, authUser, authVerification } from "@/db/schema";

const isProd = process.env.APP_ENV === "production";

/** Roles del panel: "admin" administra todo; "staff" (personal de pedidos) no gestiona usuarios. */
const roles = {
  admin: adminAc,
  staff: defaultAc.newRole({ user: [], session: [] }),
};

/**
 * Autenticación del panel administrativo (no hay cuentas de clientes: el
 * checkout es de invitado). El registro público está deshabilitado; las
 * cuentas se crean con `npm run admin:create` o desde el panel por un admin.
 */
export const auth = betterAuth({
  appName: "Rincel Colaboradores",
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? (isProd ? undefined : "dev-only-secret-change-me-dev-only-secret"),
  basePath: "/api/auth",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
      rateLimit: authRateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12 horas
    updateAge: 60 * 60, // renueva cada hora de uso
  },
  rateLimit: {
    enabled: process.env.NODE_ENV !== "test",
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 300, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: isProd,
    cookiePrefix: "rincel",
  },
  telemetry: { enabled: false },
  plugins: [
    admin({
      roles,
      adminRoles: ["admin"],
      defaultRole: "staff",
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
