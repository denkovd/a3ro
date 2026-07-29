"use client";
/* ────────────────────────────────────────────────────────────────
   Per-tier verdict-count strip — the Regime-Monitor salvage.

   PLAN-frontend-intelligence-modules.md rejected a standalone Regime
   Monitor module as redundant with the Bull Market Finder's own
   classification, keeping only this one component: a compact
   cross-tier "crypto 4/6 bull · macro 12/30 bull" readout, computed
   from the same /api/bull/latest rows already on screen. Shared
   between the Bull-Market-Finder and Relative-Strength views.
──────────────────────────────────────────────────────────────── */
import { BULL_ACCENT, type BullRow } from "../bull/bullData";
import { TIER_SHORT, tierVerdictCounts } from "./rsData";

export default function VerdictCountStrip({ rows }: { rows: BullRow[] }) {
  if (rows.length === 0) return null;
  const counts = tierVerdictCounts(rows).filter((c) => c.total > 0);
  if (counts.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 rounded-sm hairline bg-[var(--depth-1)] px-5 py-3"
      title="Bull-leaning = Double Confirmed, Conflicted Early or Conflicted Lagging — anything with at least one bullish leg, out of every symbol scanned in the tier (warm-up included)."
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
        Regime strip
      </span>
      {counts.map(({ tier, bull, total }) => (
        <p key={tier} className="flex items-baseline gap-1.5 font-mono text-[11px] tabular-nums">
          <span className="uppercase tracking-[0.15em] text-[var(--ink-2)]">{TIER_SHORT[tier]}</span>
          <span style={{ color: bull > 0 ? BULL_ACCENT : "var(--ink-3)" }}>
            {bull}/{total}
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">bull</span>
        </p>
      ))}
    </div>
  );
}
