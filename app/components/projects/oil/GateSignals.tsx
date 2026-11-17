"use client";
/* "What's unusual" — the first thing in the overview rail. Every
   chokepoint appears exactly once, in one of three groups: outside its
   typical range, within it, or with no current comparison. Missing and
   stale data are listed as such and never folded into "typical". */
import { flowHealth } from "../oilTrackerShared";
import { formatEventDate } from "../intel/primitives";
import { refineryCondition, type Refinery } from "./refineries";
import { gateArrow, gateBandText, gateContextParts, gateStatusText, hasComparison, isOutsideTypical } from "./gateSignal";
import type { CorridorWatchRow, FocusTarget, GateSignalRow } from "./types";

const HEAD = "font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]";

export default function GateSignals({ gates, others, refineries, loading, failed, compact = false, onFocus, onSelectCorridor }: {
  gates: GateSignalRow[];
  /** Non-gate corridors without a current reading (watchlist, unavailable or stale). */
  others: CorridorWatchRow[];
  refineries: Refinery[];
  loading: boolean; failed: boolean;
  /** Narrow-screen sheet: one heading line so the first readings sit above the fold. */
  compact?: boolean;
  onFocus: (target: FocusTarget) => void;
  onSelectCorridor: (id: string) => void;
}) {
  const outside = gates.filter(g => isOutsideTypical(g.signal));
  const typical = gates.filter(g => g.signal.state === "typical");
  const uncompared = gates.filter(g => !hasComparison(g.signal));
  const latest = gates.filter(g => hasComparison(g.signal)).map(g => g.signal.periodDate ?? "").sort().at(-1);
  const unverified = refineries.filter(r => refineryCondition(r).status === "unknown").length;

  return <section aria-label="Gate tanker traffic against norm">
    <h3 className={compact ? "sr-only" : "text-sm font-medium text-[var(--ink)]"}>What&apos;s unusual</h3>
    <p className={`${compact ? "truncate" : "mt-1"} ${HEAD}`}>{compact ? "Gate traffic vs norm" : "Gate tanker traffic vs norm"}{latest ? ` · week to ${formatEventDate(latest)}` : ""}</p>
    {failed && <p role="status" className="mt-2 text-[11px] text-[var(--asset-accent)]">Physical feed refresh failed · retained readings keep their dates.</p>}

    {loading ? <p className="mt-3 text-xs text-[var(--ink-3)]">Loading gate readings…</p> : <>
      {outside.length > 0 ? <ul className={`${compact ? "mt-2" : "mt-3"} flex flex-col gap-1.5`}>
        {outside.map(g => {
          const s = g.signal;
          const color = flowHealth(s.ratio!);
          const context = gateContextParts(s);
          return <li key={g.id}>
            <button type="button" onClick={() => onFocus(g.focus)} aria-label={`${g.title}: ${gateStatusText(s)}, ${gateBandText(s).toLowerCase()}. Open detail.`}
              className={`flex w-full items-start gap-2.5 border-l-2 bg-white/[0.02] px-2.5 text-left ${compact ? "py-1.5" : "py-2"} transition-colors duration-[var(--dur-micro)] hover:bg-white/[0.06]`} style={{ borderColor: color }}>
              <span aria-hidden className="mt-[1px] w-3 shrink-0 text-center text-[13px] leading-none" style={{ color }}>{gateArrow(s)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] text-[var(--ink)]">{g.title}</span>
                  <span className="shrink-0 font-mono text-[12px] text-[var(--ink)]">{s.value!.toFixed(1)}/d</span>
                </span>
                <span className="mt-1 block font-mono text-[11px] text-[var(--ink)]">{gateStatusText(s)} <span className="text-[var(--ink-3)]">· {gateBandText(s).toLowerCase()}</span></span>
                {context.length > 0 && <span className="mt-1 block text-[11px] leading-snug text-[var(--ink-2)]">{context.join(" · ")}</span>}
              </span>
            </button>
          </li>;
        })}
      </ul> : typical.length > 0 && <p className="mt-3 text-xs text-[var(--ink-2)]">No gate with a current comparison is outside its typical range.</p>}

      {typical.length > 0 && <div className="mt-4">
        <h4 className={HEAD}>Within typical range · 85–115%</h4>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {typical.map(g => <li key={g.id}>
            <button type="button" onClick={() => onFocus(g.focus)} aria-label={`${g.title}: ${gateStatusText(g.signal)}, within typical range. Open detail.`}
              className="flex min-h-8 items-center gap-1.5 border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)] hover:text-[var(--ink)]">
              <span aria-hidden className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: flowHealth(g.signal.ratio!) }} />
              {g.title} <span className="font-mono text-[var(--ink)]">{Math.round(g.signal.ratio! * 100)}%</span>
            </button>
          </li>)}
        </ul>
      </div>}

      {(uncompared.length > 0 || others.length > 0 || unverified > 0) && <div className="mt-4">
        <h4 className={HEAD}>No current reading</h4>
        <ul className="mt-2 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {uncompared.map(g => <li key={g.id}>
            <button type="button" onClick={() => onFocus(g.focus)} className="flex w-full items-baseline justify-between gap-3 py-2 text-left text-[11px] hover:bg-white/[0.03]">
              <span className="truncate text-[var(--ink-2)]">{g.title}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">{gateStatusText(g.signal)}</span>
            </button>
          </li>)}
          {others.map(c => <li key={c.id}>
            <button type="button" onClick={() => onSelectCorridor(c.id)} className="flex w-full items-baseline justify-between gap-3 py-2 text-left text-[11px] hover:bg-white/[0.03]">
              <span className="truncate text-[var(--ink-2)]">{c.title}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">{c.status === "watchlist" ? "Watchlist · no source" : c.statusText}</span>
            </button>
          </li>)}
          {unverified > 0 && <li className="flex items-baseline justify-between gap-3 py-2 text-[11px]">
            <span className="text-[var(--ink-2)]">{unverified} of {refineries.length} refineries</span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Status unverified</span>
          </li>}
        </ul>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-3)]">No reading is an absence of data. It does not establish typical traffic or normal operation.</p>
      </div>}
    </>}
  </section>;
}
