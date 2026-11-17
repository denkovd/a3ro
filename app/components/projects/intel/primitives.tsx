"use client";
/* ────────────────────────────────────────────────────────────────
   Shared intelligence-panel primitives (oil first; gold and BTC next).
   Colours come from the scoped .intel-surface / .<asset>-surface tokens
   in globals.css, so one component reads correctly in every module.
──────────────────────────────────────────────────────────────── */
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Kicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)] ${className}`}>{children}</p>;
}

export function Section({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`border-t border-[var(--line)] pt-4 ${className}`}>
    <div className="flex items-baseline justify-between gap-3"><h4 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{title}</h4>{aside}</div>
    <div className="mt-3">{children}</div>
  </section>;
}

export type Provenance = "live" | "operator" | "government" | "reported" | "reference" | "computed" | "mock" | "unavailable";

const PROVENANCE: Record<Provenance, { label: string; title: string; className: string }> = {
  live: { label: "Live", title: "Current observation from a connected feed", className: "border-[var(--asset-accent-line)] text-[var(--asset-accent)]" },
  operator: { label: "Operator", title: "Published by the company concerned", className: "border-[var(--line-2)] text-[var(--ink-2)]" },
  government: { label: "Government", title: "Published by a government body", className: "border-[var(--line-2)] text-[var(--ink-2)]" },
  reported: { label: "Reported", title: "Reported by a third party; not confirmed by the company", className: "border-dashed border-[var(--line-2)] text-[var(--ink-2)]" },
  reference: { label: "Reference", title: "Static published reference; not a live reading", className: "border-[var(--line)] text-[var(--ink-3)]" },
  computed: { label: "Computed", title: "Derived by A3RO from stored coordinates; not a documented relationship", className: "border-dotted border-[var(--line-2)] text-[var(--ink-3)]" },
  mock: { label: "Mock", title: "Sample data for layout only", className: "border-dashed border-[var(--status-alert)] text-[var(--status-alert)]" },
  unavailable: { label: "Unavailable", title: "No source in this coverage", className: "border-[var(--line)] text-[var(--ink-3)] italic" },
};

export function ProvenanceBadge({ kind }: { kind: Provenance }) {
  const p = PROVENANCE[kind];
  return <span title={p.title} className={`inline-flex shrink-0 items-center border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.14em] ${p.className}`}>{p.label}</span>;
}

/** In-panel navigation to another entity; renders as a button (no route change). */
export function EntityLink({ onClick, children, label }: { onClick: () => void; children: ReactNode; label?: string }) {
  return <button type="button" onClick={onClick} aria-label={label} className="group inline-flex min-w-0 max-w-full items-baseline gap-1 text-left text-[var(--ink)] underline decoration-[var(--line-2)] underline-offset-4 transition-colors duration-[var(--dur-micro)] hover:decoration-[var(--asset-accent)]">
    <span className="truncate">{children}</span><span aria-hidden className="text-[var(--asset-accent)] opacity-70 group-hover:opacity-100">→</span>
  </button>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-[var(--ink-3)]">{children}</p>;
}

export type TimelineItem = {
  id: string;
  date: string;
  /** Short category, e.g. "Operating event", "Project", "Ownership". */
  label: string;
  tone: "operating" | "project" | "ownership" | "notice";
  title: string;
  detail?: string;
  meta?: string[];
  provenance?: Provenance;
  sourceUrl?: string;
};

const DOT: Record<TimelineItem["tone"], string> = {
  operating: "rounded-full bg-[var(--asset-accent)]",
  project: "rotate-45 border border-[var(--asset-accent)] bg-transparent",
  ownership: "rounded-full border border-[var(--rel-own)] bg-transparent",
  notice: "rounded-full bg-[var(--ink-3)]",
};

/** Month-precision dates (YYYY-MM) are shown as months, never as a specific day. */
export function formatEventDate(date: string) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(date);
  if (!m) return date;
  const month = m[2] ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleString("en-GB", { month: "short", timeZone: "UTC" }) : "";
  return [m[3] ? String(+m[3]) : "", month, m[1]].filter(Boolean).join(" ");
}

export function Timeline({ items, empty }: { items: TimelineItem[]; empty: ReactNode }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return <ol className="relative ml-1 space-y-5 border-l border-[var(--line)] pl-4">
    {items.map(item => <li key={item.id} className="relative">
      <span aria-hidden className={`absolute -left-[21px] top-[5px] h-[7px] w-[7px] ${DOT[item.tone]}`} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <time dateTime={item.date} className="font-mono text-[11px] text-[var(--ink-2)]">{formatEventDate(item.date)}</time>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">{item.label}</span>
        {item.provenance && <ProvenanceBadge kind={item.provenance} />}
      </div>
      <p className="mt-1 text-sm text-[var(--ink)]">{item.title}</p>
      {item.detail && <p className="mt-1 text-xs leading-relaxed text-[var(--ink-2)]">{item.detail}</p>}
      {item.meta?.map(line => <p key={line} className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">{line}</p>)}
      {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-[var(--asset-accent)] underline underline-offset-2">Source ↗</a>}
    </li>)}
  </ol>;
}

export type SourceLink = { label: string; url: string };
export type SourceCheck = { lastSuccess: string | null; lastAttempt: string; ok: boolean };

/** Standard provenance footer: what backs this panel and when it was last checked. */
/** `reviewed` lists each part of the record with its own review date, so a recent
 *  relationship review never implies that an older reference was re-checked. */
export function SourceFooter({ sources, reviewed, check, note }: { sources: SourceLink[]; reviewed: { label: string; date: string | null }[]; check?: SourceCheck | null; note?: ReactNode }) {
  const unique = sources.filter((s, i) => sources.findIndex(o => o.url === s.url) === i);
  return <footer className="border-t border-[var(--line)] pt-4 text-[11px] leading-relaxed text-[var(--ink-3)]">
    <h4 className="font-mono text-[10px] uppercase tracking-[0.2em]">Sources & verification</h4>
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {reviewed.map(r => <div key={r.label} className="contents"><dt>{r.label}</dt><dd className="text-[var(--ink-2)]">{r.date ? `Reviewed ${formatEventDate(r.date)}` : "Not recorded"}</dd></div>)}
      <dt>Automated check</dt><dd className="text-[var(--ink-2)]">{check ? check.ok ? `Passed ${formatEventDate(check.lastSuccess ?? check.lastAttempt)}` : `Failed ${formatEventDate(check.lastAttempt)}${check.lastSuccess ? ` · last passed ${formatEventDate(check.lastSuccess)}` : ""}` : "None · manually reviewed reference"}</dd>
    </dl>
    {unique.length > 0 && <ul className="mt-3 space-y-1">{unique.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-[var(--asset-accent)] underline underline-offset-2">{s.label} ↗</a></li>)}</ul>}
    {note && <p className="mt-3">{note}</p>}
  </footer>;
}

/* ── InfoTip — hover / focus explanation, portal-rendered ─────────
   Used for table headers whose meaning isn't obvious (first: the Bull
   Market Finder columns). Shows after a short hover delay so sweeping
   the pointer across a header row doesn't flicker; shows immediately
   on keyboard focus (and on tap, since tapping focuses). Rendered into
   document.body so `overflow-x-auto` table wrappers can't clip it.
   Screen readers get the text through aria-describedby on a
   visually-hidden span; the floating box itself is aria-hidden.
   Esc closes it and calls preventDefault so page-level Esc handlers
   (e.g. "leave module") can ignore that keypress. */

const TIP_W = 288; // px — 18rem
const TIP_GAP = 8;
const TIP_EST_H = 170; // flip above the trigger when there's less room than this below

type TipPos = { left: number; top?: number; bottom?: number };

export function useInfoTip(text: string, align: "left" | "right" = "left") {
  const id = useId();
  const el = useRef<HTMLElement | null>(null);
  const timer = useRef<number | null>(null);
  const [pos, setPos] = useState<TipPos | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const hide = useCallback(() => { clear(); setPos(null); }, []);
  const show = (delay: number) => {
    clear();
    timer.current = window.setTimeout(() => {
      const r = el.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rawLeft = align === "right" ? r.right - TIP_W : r.left;
      const left = Math.max(TIP_GAP, Math.min(rawLeft, vw - TIP_W - TIP_GAP));
      setPos(
        r.bottom + TIP_GAP + TIP_EST_H > vh
          ? { left, bottom: vh - r.top + TIP_GAP }
          : { left, top: r.bottom + TIP_GAP },
      );
    }, delay);
  };

  // A scroll or resize would leave the box floating in the wrong place.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos, hide]);
  useEffect(() => () => clear(), []);

  const triggerProps = {
    ref: (node: HTMLElement | null) => { el.current = node; },
    "aria-describedby": id,
    onMouseEnter: () => show(150),
    onMouseLeave: hide,
    onFocus: () => show(0),
    onBlur: hide,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Escape" && pos) {
        e.preventDefault();
        hide();
      }
    },
  };

  const tip = (
    <>
      <span id={id} className="sr-only">{text}</span>
      {pos && typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[80] rounded-sm border border-[var(--line-2)] bg-[var(--depth-3)] px-3.5 py-3 text-left text-[12px] normal-case leading-relaxed tracking-normal text-[var(--ink-2)] shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
            style={{ width: TIP_W, left: pos.left, top: pos.top, bottom: pos.bottom }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );

  return { triggerProps, tip };
}
