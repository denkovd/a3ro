// Owner Ops area (roadmap #47–#53). Middleware 404s it for everyone else; each page checks again.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nav } from "../components/Chrome";

export const metadata: Metadata = { title: "Ops — A3RO owner", robots: { index: false, follow: false } };

const TABS = [
  { href: "/owner/scorecard", label: "Scorecard" },
  { href: "/owner/usage", label: "Usage limits" },
  { href: "/owner/releases", label: "Releases" },
  { href: "/owner/jobs", label: "Manual jobs" },
  { href: "/owner/growth", label: "Growth" },
  { href: "/owner/stats", label: "Site stats" },
  { href: "/owner/controls", label: "Controls" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return <main className="relative min-h-screen">
    <Nav />
    <div className="mx-auto max-w-6xl px-6 pt-28 md:px-10">
      <p className="landing-kicker">Owner · not public</p>
      <nav aria-label="Ops" className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-[var(--line)] pb-3 font-mono text-xs">
        {TABS.map((t) => <a key={t.href} href={t.href} className="text-[var(--ink-2)] hover:text-[var(--ink)]">{t.label}</a>)}
      </nav>
    </div>
    {children}
  </main>;
}
