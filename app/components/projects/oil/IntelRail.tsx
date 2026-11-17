"use client";
import type { ReactNode } from "react";
import type { CorridorMetricLatest } from "@a3ro/oil-backend";
import CorridorWatchlist from "./CorridorWatchlist";
import GateSignals from "./GateSignals";
import { isOutsideTypical } from "./gateSignal";
import PhysicalOverview from "./PhysicalOverview";
import { FLOW_ROUTES } from "../flowRoutes";
import { PRODUCERS } from "../producers";
import type { Refinery } from "./refineries";
import type { RefineryFeed } from "./useRefineries";
import RefineryWatchlist from "./RefineryWatchlist";
import { RAIL_WIDTH_PX, type FocusTarget, type OilIntelligence } from "./types";

export default function IntelRail({ intel, metrics, physicalFailed, refineries, refineryFeed, focusKey, hasFocus, focusSlot, onFocus, onSelectCorridor, onCloseFocus, backLabel, onBack, collapsed = false, onToggleCollapsed, variant = "desktop" }: {
  intel: OilIntelligence; metrics: CorridorMetricLatest[] | null; physicalFailed: boolean;
  hasFocus: boolean; focusSlot?: ReactNode; onFocus: (target: FocusTarget) => void;
  focusKey: string; refineries: Refinery[]; refineryFeed: RefineryFeed;
  onSelectCorridor: (id: string) => void; onCloseFocus: () => void; variant?: "desktop" | "mobile";
  /** Name of the previous selection in this drawer's trail; null hides the control. */
  backLabel?: string | null; onBack?: () => void;
  /** Mobile overview sheet only: folded down to its header so the globe keeps the screen. */
  collapsed?: boolean; onToggleCollapsed?: () => void;
}) {
  const outside = intel.gates.filter(g => isOutsideTypical(g.signal)).length;
  const live = intel.corridors.filter(c => c.status === "live");
  const folded = variant === "mobile" && !hasFocus && collapsed;
  return <aside aria-label="Oil intelligence rail" className={variant === "mobile"
    ? "flex h-full min-h-0 flex-col border-t border-[var(--line)] bg-[rgba(11,13,13,0.96)] px-4 py-3"
    : "flex h-full min-h-0 flex-col border-l border-[var(--line)] bg-[rgba(11,13,13,0.92)] px-5 py-4"}
    style={variant === "desktop" ? { width: RAIL_WIDTH_PX } : undefined}>
    <div className={`flex shrink-0 items-center justify-between ${folded ? "" : variant === "mobile" && !hasFocus ? "mb-2 border-b border-[var(--line)]" : "mb-4 border-b border-[var(--line)] pb-3"}`}>
      {backLabel && onBack
        ? <button type="button" onClick={onBack} className="min-h-11 min-w-0 truncate pr-2 text-left text-[11px] text-[var(--ink-2)] hover:text-[var(--ink)]" title={`Back to ${backLabel}`}><span aria-hidden className="text-[var(--asset-accent)]">← </span>{backLabel}</button>
        : <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--ink-3)]">{folded ? `Overview · ${outside} gate${outside === 1 ? "" : "s"} outside typical range` : `Intelligence · ${hasFocus ? "Selected" : "Overview"}`}</p>}
      {hasFocus && <button type="button" onClick={onCloseFocus} aria-label={variant === "mobile" ? "Close oil details" : "Return to oil overview"} className="min-h-11 shrink-0 px-3 py-2 text-[11px] text-[var(--asset-accent)] hover:bg-white/5">{variant === "mobile" ? "Close ×" : "Overview ×"}</button>}
      {variant === "mobile" && !hasFocus && onToggleCollapsed && <button type="button" onClick={onToggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? "Show oil overview" : "Hide oil overview"} className="min-h-11 shrink-0 px-3 py-2 text-[11px] text-[var(--asset-accent)] hover:bg-white/5">{collapsed ? "Show ▴" : "Hide ▾"}</button>}
    </div>
    {!folded && <div key={focusKey} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1" aria-live="polite">
      {hasFocus ? focusSlot : <div className="space-y-6">
        {/* signal first: departures from the norm, then other corridors, then reference readings */}
        <GateSignals compact={variant === "mobile"} gates={intel.gates} others={intel.corridors.filter(c => c.status !== "live")} refineries={refineries}
          loading={metrics === null && !physicalFailed} failed={physicalFailed} onFocus={onFocus} onSelectCorridor={onSelectCorridor} />
        {live.length > 0 && <CorridorWatchlist corridors={live} selectedId={null} onSelect={onSelectCorridor} />}
        <PhysicalOverview metrics={metrics} failed={physicalFailed} />
        <RefineryWatchlist refineries={refineries} feed={refineryFeed} onFocus={onFocus} />
        <details><summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Explore flow routes</summary><ul className="mt-2 divide-y divide-[var(--line)]">{FLOW_ROUTES.map(route => <li key={route.id}><button type="button" onClick={() => onFocus({ kind: "route", id: route.id })} className="w-full py-3 text-left text-[11px] text-[var(--ink-2)] hover:bg-white/5">{route.name}</button></li>)}</ul></details>
        <details><summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wide text-[var(--ink-3)]">Producer references</summary><ul className="mt-2 divide-y divide-[var(--line)]">{PRODUCERS.map(p => <li key={p.id}><button type="button" onClick={() => onFocus({ kind: "producer", id: p.id })} className="w-full py-3 text-left text-[11px] text-[var(--ink-2)] hover:bg-white/5">{p.name} · annual reference</button></li>)}</ul></details>
      </div>}
    </div>}
  </aside>;
}
export { RAIL_WIDTH_PX };
