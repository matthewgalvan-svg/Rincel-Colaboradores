import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoLockup } from "@/components/brand/Logo";
import { getStaffUser } from "@/lib/auth/guard";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Acceso" };

export default async function AccesoPage() {
  if (await getStaffUser()) redirect("/admin");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <LogoLockup href="/admin/acceso" />
        </div>
        <div className="card p-6">
          <h1 className="text-2xl">Acceso al panel</h1>
          <p className="mt-1 text-sm text-tinta-suave">Solo personal autorizado.</p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
