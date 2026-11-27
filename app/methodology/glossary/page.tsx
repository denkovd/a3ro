import type { Metadata } from "next";
import { MethodologyPage } from "../content";
import { GLOSSARY as GROUPS } from "./terms";

export const metadata: Metadata = {
  title: "Glossary — A3RO Intelligence",
  description: "Plain-English definitions of the market, economic and crypto terms used across A3RO.",
  alternates: { canonical: "/methodology/glossary" },
};

export default function Glossary() {
  return <MethodologyPage title="Glossary" updated="27 November 2026">
    <p>Plain-English definitions of the terms used across A3RO. Each term has its own link, so a module can point straight to it.</p>
    <nav aria-label="Glossary sections" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{GROUPS.map((g) => <a key={g.title} href={`#${g.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{g.title}</a>)}</nav>
    {GROUPS.map((g) => <section key={g.title}>
      <h2 id={g.title.toLowerCase().replace(/[^a-z]+/g, "-")}>{g.title}</h2>
      <dl className="mt-3 flex flex-col gap-3">{g.entries.map((e) => <div key={e.id} id={e.id} className="scroll-mt-28 target:rounded target:bg-white/[0.04] target:p-2">
        <dt className="font-medium text-[var(--ink)]">{e.term}</dt>
        <dd className="mt-0.5">{e.def}</dd>
      </div>)}</dl>
    </section>)}
  </MethodologyPage>;
}

