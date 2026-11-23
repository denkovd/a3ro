import type { ReactNode } from "react";
import { Nav } from "./Chrome";
import SiteFooter from "./SiteFooter";

export function LegalPage({ kicker, title, updated, children }: { kicker: string; title: string; updated: string; children: ReactNode }) {
  return <main className="relative min-h-screen">
    <Nav />
    <article className="legal mx-auto max-w-3xl px-6 pb-20 pt-36 text-sm leading-relaxed text-[var(--ink-2)] md:px-10">
      <p className="landing-kicker">{kicker}</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
      <p className="mt-2 font-mono text-[11px] text-[var(--ink-3)]">Last updated {updated}</p>
      <div className="mt-10 flex flex-col gap-4 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-[var(--ink)] [&_ul]:list-disc [&_ul]:pl-5 [&_a]:underline">
        {children}
      </div>
    </article>
    <SiteFooter />
  </main>;
}
