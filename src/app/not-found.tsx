import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container-page flex min-h-[70dvh] flex-col items-center justify-center py-16 text-center">
      <Image src="/marca/rincelito.webp" alt="" width={160} height={178} className="h-40 w-auto" />
      <h1 className="mt-4 text-3xl">No encontramos esta página</h1>
      <p className="mt-2 text-tinta-suave">Puede que el enlace haya cambiado.</p>
      <Link href="/" className="btn-primary mt-6">
        Ir al inicio
      </Link>
    </main>
  );
}
