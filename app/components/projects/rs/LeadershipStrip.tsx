"use client";
/* ────────────────────────────────────────────────────────────────
   Leadership strip — compact top-5/bottom-5 by RS momentum.

   Self-contained: owns its local scan-history read (a localStorage
   accumulator, not a network fetch — see rsHistory.ts) so it drops
   into any view with just `rows` + `runDate`. Embedded in both the
   Bull-Market-Finder view and the full Relative-Strength module.
──────────────────────────────────────────────────────────────── */
import { TIER_LABEL, type BullRow } from "../bull/bullData";
import { formatRs, leadershipRanking, momentumColor, type LeadershipEntry } from "./rsData";
import { useScanHistory } from "./rsHistory";

function EntryRow({ entry, mode }: { entry: LeadershipEntry; mode: "momentum" | "rs63_fallback" }) {
  const { row, momentum } = entry;
  const value = mode === "momentum" ? momentum.value : row.rs63;
  return (
    <p className="flex items-baseline justify-between gap-3 py-1">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[12px] text-[var(--ink)]">{row.displayName}</span>
        <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          {TIER_LABEL[row.tier]}
        </span>
      </span>
      <span
        className="shrink-0 font-mono text-[11px] tabular-nums"
        style={{ color: momentumColor(value) }}
      >
        {formatRs(value)}
      </span>
    </p>
  );
}

export default function LeadershipStrip({ rows, runDate }: { rows: BullRow[]; runDate: string | null }) {
  const history = useScanHistory(rows, runDate);
  if (rows.length === 0) return null;
  const { top, bottom, mode } = leadershipRanking(rows, history);
  if (top.length === 0 && bottom.length === 0) return null;

  return (
    <div className="rounded-sm hairline bg-[var(--depth-1)] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          RS leadership {mode === "rs63_fallback" ? "— warming up" : "— momentum"}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          {mode === "rs63_fallback" ? "ranked by RS 63d (local scan history under 2 scans)" : "Δ RS 63d, local scan history"}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Leading</p>
          <div className="mt-1 divide-y divide-[var(--line)]">
            {top.map((e) => (
              <EntryRow key={e.row.symbol} entry={e} mode={mode} />
            ))}
          </div>
        </div>
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Lagging</p>
          <div className="mt-1 divide-y divide-[var(--line)]">
            {bottom.map((e) => (
              <EntryRow key={e.row.symbol} entry={e} mode={mode} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
