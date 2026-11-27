import type { Metadata } from "next";
import Link from "next/link";
import { MethodologyPage } from "./content";
import { METHODOLOGY_PAGES } from "./pages";

export const metadata: Metadata = {
  title: "Methodology — A3RO Intelligence",
  description: "How A3RO's modules work: data sources, rules and limits, in plain English.",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyIndex() {
  return <MethodologyPage title="How A3RO works" updated="27 November 2026">
    <p>Every A3RO module is built from rules you can check by hand: where the data comes from, what is calculated, and what it can&rsquo;t tell you. These pages set that out, one module at a time. More modules will follow.</p>
    <ul className="!list-none !pl-0 flex flex-col gap-3">
      {METHODOLOGY_PAGES.map((p) => <li key={p.path} className="rounded-lg border border-[var(--line)] p-4">
        <Link href={p.path} className="text-base font-medium text-[var(--ink)]">{p.title}</Link>
        <p className="mt-1 text-[var(--ink-2)]">{p.blurb}</p>
      </li>)}
    </ul>
  </MethodologyPage>;
}
