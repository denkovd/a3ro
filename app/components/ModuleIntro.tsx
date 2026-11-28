"use client";
/* Module intro panel and section hints (roadmap #118). Copy lives in lib/moduleIntros.ts.
   The panel is dismissible; the choice is remembered in this browser only, and a small
   "How to read this page" link brings it back. */
import { useEffect, useState } from "react";
import { MODULE_INTROS } from "../../lib/moduleIntros";

const key = (module: string) => `a3ro:intro-dismissed:${module}`;

export default function ModuleIntro({ module, accent }: { module: string; accent: string }) {
  const intro = MODULE_INTROS[module];
  // null until mounted, so returning visitors who dismissed it never see a flash.
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(key(module)) === "1"; } catch { /* storage blocked: show it */ }
    setOpen(!dismissed);
  }, [module]);
  if (!intro || open === null) return null;

  const set = (next: boolean) => {
    setOpen(next);
    try { if (next) localStorage.removeItem(key(module)); else localStorage.setItem(key(module), "1"); } catch { /* ignore */ }
  };

  if (!open) return <button type="button" onClick={() => set(true)}
    className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline">
    How to read this page
  </button>;

  return <aside aria-labelledby={`intro-${module}`} className="mt-6 max-w-3xl rounded-md border border-[var(--line)] bg-[var(--depth-1)] p-5"
    style={{ borderLeft: `2px solid ${accent}` }}>
    <div className="flex items-start justify-between gap-4">
      <p id={`intro-${module}`} className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: accent }}>New here? How to read this page</p>
      <button type="button" onClick={() => set(false)} aria-label="Hide this introduction"
        className="-mr-1 -mt-1 px-1 font-mono text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">×</button>
    </div>
    <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--ink-2)]">
      {intro.lines.map((l) => <li key={l}>{l}</li>)}
    </ul>
    <a href={intro.methodology.href} className="mt-3 inline-block text-xs underline" style={{ color: accent }}>{intro.methodology.label} →</a>
  </aside>;
}

/** One-line hint under a section heading, or nothing if the module has none for it. */
export function SectionHint({ module, section }: { module: string; section: string }) {
  const text = MODULE_INTROS[module]?.sections[section];
  return text ? <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">{text}</p> : null;
}
