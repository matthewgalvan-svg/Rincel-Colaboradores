"use client";

import Link from "next/link";
import { track } from "@/components/analytics/track";

/** Enlace que registra el clic del CTA (sin datos personales). */
export function TrackedLink({ href, ctaId, className, children, external = false, productId }: { href: string; ctaId: string; className?: string; children: React.ReactNode; external?: boolean; productId?: string }) {
  const onClick = () => track(href.includes("wa.me") ? "whatsapp_click" : "cta_click", { ctaId, productId });
  if (external) {
    return (
      <a href={href} className={className} onClick={onClick} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
