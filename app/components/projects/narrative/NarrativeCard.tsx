"use client";
/* ────────────────────────────────────────────────────────────────
   Narrative Rotation — board card. One narrative: 1d/1w/1m delta
   chips, overall score, input count + staleness, and a compact
   market-corroboration readout so "is attention rising" always sits
   next to "is price confirming".
──────────────────────────────────────────────────────────────── */
import {
  NARR_ACCENT,
  NARR_MUTED_PINK,
  fmtScore,
  fmtRs,
  fmtPctBullish,
  scoreColor,
  daysSince,
  formatStaleness,
  type NarrativeBoardRow,
} from "./narrativeData";
import type { Window } from "./narrativeScoring";

const WINDOW_LABEL: Record<Window, string> = { "1d": "1D", "1w": "1W", "1m": "1M" };

function Chip({ window, value }: { window: Window; value: number | null }) {
  const color = scoreColor(value);
  const glyph = value === null ? "·" : value > 0.05 ? "▲" : value < -0.05 ? "▼" : "·";
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-[2px] border border-[var(--line)] px-2 py-1">
      <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{WINDOW_LABEL[window]}</span>
      <span className="font-mono text-[11px] tabular-nums" style={{ color }}>
        {glyph} {fmtScore(value)}
      </span>
    </div>
  );
}

export default function NarrativeCard({
  row,
  active,
  onSelect,
}: {
  row: NarrativeBoardRow;
  active: boolean;
  onSelect: () => void;
}) {
  const { def, scoreRow, corroboration, lastInputDate } = row;
  const insufficient = scoreRow.status === "insufficient_data";
  const stale = daysSince(lastInputDate);

  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className="flex flex-col rounded-sm border bg-[var(--depth-1)] p-4 text-left transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)]"
      style={{ borderColor: active ? `${NARR_ACCENT}55` : "var(--line)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-[var(--ink)]">{def.label}</h3>
        <span
          className="shrink-0 font-mono text-[11px] tabular-nums"
          style={{ color: insufficient ? "var(--ink-3)" : scoreColor(scoreRow.score) }}
        >
          {insufficient ? "insufficient_data" : fmtScore(scoreRow.score)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {(["1d", "1w", "1m"] as Window[]).map((w) => (
          <Chip key={w} window={w} value={insufficient ? null : scoreRow.chips[w]} />
        ))}
      </div>

      <div className="mt-3 flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
        <span>{scoreRow.inputCount} input{scoreRow.inputCount === 1 ? "" : "s"}</span>
        <span style={{ color: stale !== null && stale > 7 ? NARR_MUTED_PINK : "var(--ink-3)" }}>
          {formatStaleness(stale)}
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between border-t border-[var(--line)] pt-2.5 font-mono text-[10px] tabular-nums text-[var(--ink-2)]">
        <span>
          RS63 <span className="text-[var(--ink)]">{fmtRs(corroboration.medianRs63)}</span>
        </span>
        <span>
          {fmtPctBullish(corroboration.pctBullish)} bullish
          <span className="text-[var(--ink-3)]"> · {corroboration.matchedCount}/{corroboration.totalSymbols}</span>
        </span>
      </div>
    </button>
  );
}
