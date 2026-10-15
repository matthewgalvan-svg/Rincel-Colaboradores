import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POLICIES } from "@/content/politicas";

export function generateStaticParams() {
  return POLICIES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = POLICIES.find((x) => x.slug === slug);
  return p ? { title: p.title, description: p.description, alternates: { canonical: `/politicas/${p.slug}` } } : {};
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = POLICIES.find((x) => x.slug === slug);
  if (!p) notFound();
  return (
    <div className="container-page max-w-3xl pt-8">
      <nav aria-label="Políticas" className="mb-6 flex flex-wrap gap-2 text-sm">
        {POLICIES.map((x) => (
          <Link key={x.slug} href={`/politicas/${x.slug}`} aria-current={x.slug === p.slug ? "page" : undefined} className={`rounded-full px-3 py-1.5 font-bold ${x.slug === p.slug ? "bg-marino text-white" : "bg-celeste-50 text-marino hover:bg-celeste"}`}>
            {x.title}
          </Link>
        ))}
      </nav>
      <h1 className="text-3xl sm:text-4xl">{p.title}</h1>
      <p className="mt-2 text-lg text-tinta-suave">{p.description}</p>
      <div className="prose-rincel mt-6">
        {p.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs?.map((t) => <p key={t}>{t}</p>)}
            {s.bullets ? (
              <ul>
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
      {p.pending.length ? (
        <aside className="pendiente mt-8" aria-label="Pendiente de revisión">
          <p className="font-extrabold">Documento en revisión por el negocio. Puntos por completar:</p>
          <ul className="mt-2 list-disc pl-5 font-semibold">
            {p.pending.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}
