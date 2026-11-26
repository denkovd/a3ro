"use client";
/* ────────────────────────────────────────────────────────────────
   Commodity Watch — right-rail building blocks (shared section
   template, roadmap #55). Every commodity section is built from the
   same parts: price widget, flows, supply vs demand, company list and
   sources, inside one rail shell. Uranium, iron ore, and later copper
   and LNG use these so the sections look and behave alike.
──────────────────────────────────────────────────────────────── */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import TradingViewWidget from "../../TradingViewWidget";

export interface RailSource { label: string; url: string; reviewed: string }

export const rowBtn = "flex w-full items-center justify-between gap-2 rounded-sm px-1 py-2 text-left hover:bg-[var(--depth-2)]";
export const n = (v: number) => v.toLocaleString("en-AU");
export const pct = (v: number) => `${Math.round(v * 100)}%`;

export const Kicker = ({ children }: { children: ReactNode }) => <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">{children}</p>;

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div><dt className="text-[10px] text-[var(--ink-3)]">{label}</dt><dd className="mt-1 font-mono text-[13px] tabular-nums text-[var(--ink)]">{value}</dd>{sub ? <dd className="text-[9px] text-[var(--ink-3)]">{sub}</dd> : null}</div>;
}

export function SourceLink({ source, accent }: { source: RailSource; accent: string }) {
  return <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] underline" style={{ color: accent }}>{source.label} ↗ <span className="text-[var(--ink-3)] no-underline">· checked {source.reviewed}</span></a>;
}

/** A section of the overview, with the hairline under it. */
export function RailSection({ label, kicker, last, children }: { label: string; kicker?: ReactNode; last?: boolean; children: ReactNode }) {
  return <section aria-label={label} className={`mt-3 first:mt-0 ${last ? "" : "border-b border-[var(--line)] pb-3"}`}>
    {kicker ? <Kicker>{kicker}</Kicker> : null}
    {children}
  </section>;
}

/** Big headline figure for a detail view. */
export function Headline({ value, sub, color }: { value: string; sub?: string; color: string }) {
  return <><p className="mt-3 font-mono text-3xl tabular-nums" style={{ color }}>{value}</p>{sub ? <p className="mt-1 text-[11px] text-[var(--ink-3)]">{sub}</p> : null}</>;
}

/** Delayed TradingView price, with the line under it saying what it is. `rgb` is "r,g,b". */
export function PriceBlock({ symbol, kicker, label, note, accent, rgb }: { symbol: string; kicker: string; label: string; note: string; accent: string; rgb: string }) {
  return <RailSection label="Price" kicker={kicker}>
    <TradingViewWidget widget="mini-symbol-overview" height={170} label={label}
      config={{ symbol, dateRange: "12M", trendLineColor: accent, underLineColor: `rgba(${rgb},0.12)`, underLineBottomColor: `rgba(${rgb},0)` }} />
    <p className="mt-1 text-[10px] text-[var(--ink-3)]">{note}</p>
  </RailSection>;
}

export interface RailCompany { name: string; tv: string; role: string; australian?: boolean; assetSlug?: string }

export function CompanyList({ companies, accent, kicker = "Listed companies & funds", note }: { companies: readonly RailCompany[]; accent: string; kicker?: string; note: string }) {
  return <RailSection label={kicker} kicker={kicker}>
    <ul className="mt-1 divide-y divide-[var(--line)]">{companies.map((c) => <li key={c.tv} className="py-2">
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-[var(--ink)]">{c.name}{c.australian ? <span className="ml-1 text-[9px] text-[var(--ink-3)]">AU</span> : null}</span>
        {c.assetSlug ? <Link href={`/assets/${c.assetSlug}`} className="font-mono text-[10px] underline" style={{ color: accent }}>{c.tv}</Link>
          : <a href={`https://www.tradingview.com/symbols/${c.tv.replace(":", "-")}/`} target="_blank" rel="noreferrer" className="font-mono text-[10px] underline" style={{ color: accent }}>{c.tv} ↗</a>}</div>
      <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--ink-3)]">{c.role}</p>
    </li>)}</ul>
    <p className="mt-1 text-[9px] text-[var(--ink-3)]">{note}</p>
  </RailSection>;
}

export function SourceList({ sources, note }: { sources: readonly RailSource[]; note: string }) {
  return <RailSection label="Sources" kicker="Sources" last>
    <ul className="mt-1 space-y-1">{sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-[var(--ink-2)] underline">{s.label} ↗</a></li>)}</ul>
    <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-3)]">{note}</p>
  </RailSection>;
}

/** Tabbed list of everything on the globe, so it can be reached without hunting for pins. */
export function Explorer<T extends string>({ tabs, current, onTab, accentFor, children, footnote }: {
  tabs: readonly { id: T; label: string }[];
  current: T;
  onTab: (t: T) => void;
  accentFor: (t: T) => string;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return <RailSection label="Explorer">
    <div role="group" aria-label="Category" className="flex flex-wrap gap-x-3">
      {tabs.map((t) => <button type="button" key={t.id} aria-pressed={current === t.id} onClick={() => onTab(t.id)} className="py-1 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: current === t.id ? accentFor(t.id) : "var(--ink-3)" }}>{t.label}</button>)}
    </div>
    <ul className="mt-1 divide-y divide-[var(--line)]">{children}</ul>
    {footnote ? <p className="mt-1 text-[9px] text-[var(--ink-3)]">{footnote}</p> : null}
  </RailSection>;
}

/**
 * The rail itself: a fixed column on desktop, a bottom sheet that can be hidden on phones.
 * `selectedKey` changes scroll the content back to the top and re-open the sheet.
 */
export function RailShell({ id, label, kicker, title, narrow, selectedKey, onBack, backLabel, children }: {
  id: string;
  label: string;
  kicker: string;
  title: string;
  narrow: boolean;
  selectedKey: string | null;
  onBack: () => void;
  backLabel: string;
  children: ReactNode;
}) {
  const key = selectedKey ?? "overview";
  const [collapsedFor, setCollapsedFor] = useState<string | null>(null);
  const mobileOpen = collapsedFor !== key;
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [key]);
  return (
    <aside aria-label={label} className={`absolute z-20 flex flex-col overflow-hidden rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.94)] backdrop-blur-md ${narrow ? "inset-x-3 bottom-14 max-h-[44%]" : "bottom-6 right-6 top-4 w-[340px]"}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <div><Kicker>{kicker}</Kicker><h3 className="mt-1 text-sm font-medium text-[var(--ink)]">{selectedKey ? "Detail" : title}</h3></div>
        {selectedKey ? <button type="button" onClick={onBack} className="px-2 py-2 text-[11px] text-[var(--ink-2)] hover:text-[var(--ink)]" aria-label={backLabel}>← Back</button> : null}
        {narrow ? <button type="button" aria-expanded={mobileOpen} aria-controls={id} onClick={() => setCollapsedFor(mobileOpen ? key : null)} className="px-2 py-2 text-[11px] text-[var(--ink-2)]">{mobileOpen ? "Hide" : "Show"}</button> : null}
      </div>
      <div id={id} ref={contentRef} hidden={narrow && !mobileOpen} className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
        {children}
      </div>
    </aside>
  );
}
