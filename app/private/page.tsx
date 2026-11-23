// Shown (via middleware rewrite) when a visitor who isn't the owner opens a gated module.
// Roadmap #35 will turn this into a per-module preview with a newsletter sign-up.
import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import { MODULE_ACCESS, safeNextPath } from "../../lib/access";

export const metadata: Metadata = { title: "Private module — A3RO Intelligence", robots: { index: false, follow: false } };

export default async function PrivatePage({ searchParams }: { searchParams: Promise<{ module?: string; next?: string }> }) {
  const params = await searchParams;
  const module = MODULE_ACCESS.find((m) => m.id === params.module);
  const next = safeNextPath(params.next);
  return <main className="relative min-h-screen">
    <Nav />
    <section className="mx-auto flex max-w-xl flex-col gap-6 px-6 pb-20 pt-40">
      <p className="landing-kicker">Private beta</p>
      <h1 className="text-3xl font-semibold tracking-tight">{module ? module.label : "This module"} isn't public yet</h1>
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">
        It uses market data that isn't licensed for public display yet, so for now it's limited to the owner. Australia Watch, AI Dividend and Commodity Watch are open to everyone.
      </p>
      <div className="flex flex-wrap gap-6">
        <a href="/Projects/Australia-Watch" className="sweep font-mono text-xs uppercase tracking-[0.2em]">Australia Watch ↗</a>
        <a href="/Projects/AI-Dividend" className="sweep font-mono text-xs uppercase tracking-[0.2em]">AI Dividend ↗</a>
        <a href="/Projects/Oil-Tracker" className="sweep font-mono text-xs uppercase tracking-[0.2em]">Commodity Watch ↗</a>
      </div>
      <a href={`/login?next=${encodeURIComponent(next)}`} className="w-fit font-mono text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)]">Owner sign-in</a>
    </section>
  </main>;
}
