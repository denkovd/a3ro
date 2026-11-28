"use client";
/* Module intro panel and section hints (roadmap #118). Copy lives in lib/moduleIntros.ts.
   The panel is dismissible; the choice is remembered in this browser only, and a small
   "How to read this page" link brings it back. */
import { useEffect, useState } from "react";
import { MODULE_INTROS } from "../../lib/moduleIntros";

const key = (module: string) => `a3ro:intro-dismissed:${module}`;

const GLOSSARY = { href: "/methodology/glossary", label: "Glossary of terms" };

/** `compact` is for globe sidebars: no outer margin or width cap, smaller type. */
export default function ModuleIntro({ module, accent, compact = false }: { module: string; accent: string; compact?: boolean }) {
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
    className={`${compact ? "mb-3" : "mt-4"} font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline`}>
    How to read this page
  </button>;

  const link = intro.methodology ?? GLOSSARY;
  return <aside aria-labelledby={`intro-${module}`} className={compact ? "mb-3 rounded-sm border border-[var(--line)] bg-[var(--depth-1)] p-3" : "mt-6 max-w-3xl rounded-md border border-[var(--line)] bg-[var(--depth-1)] p-5"}
    style={{ borderLeft: `2px solid ${accent}` }}>
    <div className="flex items-start justify-between gap-4">
      <p id={`intro-${module}`} className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: accent }}>New here? How to read this page</p>
      <button type="button" onClick={() => set(false)} aria-label="Hide this introduction"
        className="-mr-1 -mt-1 px-1 font-mono text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">×</button>
    </div>
    <ul className={compact ? "mt-2 space-y-1.5 text-[11px] leading-relaxed text-[var(--ink-2)]" : "mt-3 space-y-2 text-sm leading-relaxed text-[var(--ink-2)]"}>
      {intro.lines.map((l) => <li key={l}>{l}</li>)}
    </ul>
    <a href={link.href} className={`${compact ? "mt-2 text-[11px]" : "mt-3 text-xs"} inline-block underline`} style={{ color: accent }}>{link.label} →</a>
  </aside>;
}

/** One-line hint under a section heading, or nothing if the module has none for it. */
export function SectionHint({ module, section }: { module: string; section: string }) {
  const text = MODULE_INTROS[module]?.sections?.[section];
  return text ? <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">{text}</p> : null;
}

/** Smaller hint for globe sidebars, keyed by the section's label. */
export function RailHint({ module, label }: { module: string | null; label: string }) {
  const text = module ? MODULE_INTROS[module]?.sections?.[label] : undefined;
  return text ? <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-3)]">{text}</p> : null;
}
