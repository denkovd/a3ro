/* Methodology pages (roadmap #29): shared layout and the list of pages. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";

export { METHODOLOGY_PAGES } from "./pages";

export function MethodologyPage({ title, updated, moduleHref, moduleLabel, children }: { title: string; updated: string; moduleHref?: string; moduleLabel?: string; children: ReactNode }) {
  return <main className="relative min-h-screen">
    <Nav />
    <article className="mx-auto max-w-3xl px-6 pb-20 pt-36 text-sm leading-relaxed text-[var(--ink-2)] md:px-10">
      <p className="landing-kicker"><Link href="/methodology" className="hover:underline">Methodology</Link></p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
      <p className="mt-2 font-mono text-[11px] text-[var(--ink-3)]">Last updated {updated}{moduleHref ? <> · <Link href={moduleHref} className="underline">Open {moduleLabel}</Link></> : null}</p>
      <div className="mt-10 flex flex-col gap-4 [&_a]:underline [&_h2]:mt-8 [&_h2]:scroll-mt-28 [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-[var(--ink)] [&_h3]:mt-3 [&_h3]:font-medium [&_h3]:text-[var(--ink)] [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        {children}
      </div>
      <p className="mt-12 border-t border-[var(--line)] pt-4 text-xs text-[var(--ink-3)]">A3RO describes markets and data; it doesn&rsquo;t give personal financial advice. See the <Link href="/terms" className="underline">terms</Link>. Spotted something wrong? Tell us through the contact form on the home page.</p>
    </article>
    <SiteFooter />
  </main>;
}

/** Link to a glossary entry. */
export function Term({ id, children }: { id: string; children: ReactNode }) {
  return <Link href={`/methodology/glossary#${id}`} className="decoration-dotted underline-offset-2">{children}</Link>;
}
