"use client";
/* ────────────────────────────────────────────────────────────────
   Persistent intelligence rail — always on. Focus detail docks in
   the lower half without unmounting stance / drivers / benchmarks.
──────────────────────────────────────────────────────────────── */
import type { ReactNode } from "react";
import type { Benchmark } from "@a3ro/oil-backend";
import StanceBlock from "./StanceBlock";
import WhyNowDrivers from "./WhyNowDrivers";
import BenchmarkStrip from "./BenchmarkStrip";
import CorridorWatchlist from "./CorridorWatchlist";
import FlowHealthLegend from "./FlowHealthLegend";
import { RAIL_WIDTH_PX, type FocusTarget, type OilIntelligence } from "./types";

export default function IntelRail({
  intel,
  selectedCorridorId,
  selectedBenchmark,
  hasFocus,
  focusSlot,
  onFocus,
  onSelectCorridor,
  onSelectBenchmark,
  onCloseFocus,
  className = "",
  /** Mobile bottom-sheet vs desktop side rail */
  variant = "desktop",
}: {
  intel: OilIntelligence;
  selectedCorridorId: string | null;
  selectedBenchmark: Benchmark | null;
  hasFocus: boolean;
  focusSlot?: ReactNode;
  onFocus: (target: FocusTarget) => void;
  onSelectCorridor: (id: string) => void;
  onSelectBenchmark: (b: Benchmark) => void;
  onCloseFocus?: () => void;
  className?: string;
  variant?: "desktop" | "mobile";
}) {
  const body = (
    <>
      {/* System context — never unmounts when focus opens */}
      <div className={`shrink-0 space-y-4 ${hasFocus ? "pb-3 border-b border-[var(--line)]" : ""}`}>
        <StanceBlock stance={intel.stance} />
        <WhyNowDrivers drivers={intel.drivers} onFocus={onFocus} />
        <BenchmarkStrip
          benchmarks={intel.benchmarks}
          spread={intel.spread}
          selected={selectedBenchmark}
          onSelect={onSelectBenchmark}
        />
      </div>

      {/* Watchlist collapses visually when focus is open but stays reachable via scroll */}
      <div className={`min-h-0 ${hasFocus ? "max-h-[28%] overflow-y-auto py-3 border-b border-[var(--line)]" : "flex-1 overflow-y-auto py-4"}`}>
        <CorridorWatchlist
          corridors={intel.corridors}
          selectedId={selectedCorridorId}
          onSelect={onSelectCorridor}
        />
        {!hasFocus && <FlowHealthLegend className="mt-3 px-0.5" />}
      </div>

      {/* Focus detail dock */}
      {hasFocus && focusSlot && (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-3">
          {onCloseFocus && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={onCloseFocus}
                aria-label="Close detail"
                className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
              >
                Close ×
              </button>
            </div>
          )}
          {focusSlot}
        </div>
      )}
    </>
  );

  if (variant === "mobile") {
    return (
      <aside
        aria-label="Oil intelligence rail"
        className={`flex max-h-[52vh] flex-col border-t border-[var(--line)] bg-[rgba(11,13,13,0.94)] px-4 pb-3 pt-3 backdrop-blur-md ${className}`}
      >
        {body}
      </aside>
    );
  }

  return (
    <aside
      aria-label="Oil intelligence rail"
      className={`flex h-full flex-col border-l border-[var(--line)] bg-[rgba(11,13,13,0.92)] px-4 py-4 backdrop-blur-md ${className}`}
      style={{ width: RAIL_WIDTH_PX }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2 shrink-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          Intelligence
        </p>
        <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          {intel.feedStatus === "error"
            ? "Offline"
            : intel.feedClock
              ? intel.feedClock
              : "—"}
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </aside>
  );
}

export { RAIL_WIDTH_PX };
