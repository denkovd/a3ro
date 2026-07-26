"use client";
/* ────────────────────────────────────────────────────────────────
   Leadership rotation table — fed by /api/bull/transitions.

   The endpoint carries verdict transitions (fromVerdict -> toVerdict
   on a date), not historical rank — so "current rank" here is
   today's scan rank for context, not the rank at the moment the flip
   happened. That distinction is stated in the footnote rather than
   implied by the column header.
──────────────────────────────────────────────────────────────── */
import { useMemo } from "react";
import {
  BULL_VERDICT_META,
  TIER_LABEL,
  formatDate,
  type BullRow,
  type BullStatus,
  type BullTransitionRow,
} from "../bull/bullData";

const GRID = "grid grid-cols-[5.5rem_minmax(10rem,1.6fr)_5.5rem_1fr_5rem] items-baseline gap-x-3";

export default function RotationTable({
  transitions,
  status,
  rows,
}: {
  transitions: BullTransitionRow[];
  status: BullStatus;
  rows: BullRow[];
}) {
  const rankBySymbol = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.symbol, r.rank);
    return m;
  }, [rows]);

  const sorted = useMemo(
    () => [...transitions].sort((a, b) => b.runDate.localeCompare(a.runDate)),
    [transitions],
  );

  if (status === "loading") {
    return (
      <div aria-hidden className="animate-pulse">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${GRID} border-b border-[var(--line)] py-3`}>
            {Array.from({ length: 5 }, (_, j) => (
              <span key={j} className="h-[9px] rounded-full bg-[var(--depth-3)]" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (status !== "live" || sorted.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-[var(--ink-3)]">
        No verdict transitions in this window.
      </p>
    );
  }

  return (
    <div>
      <div className={`${GRID} border-b border-[var(--line)] pb-2`}>
        {["Date", "Asset", "Tier", "Transition", "Rank"].map((h, i) => (
          <p
            key={h}
            className={`font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)] ${i === 4 ? "text-right" : ""}`}
          >
            {h}
          </p>
        ))}
      </div>
      <div className="max-h-[26rem] overflow-y-auto" data-lenis-prevent>
        {sorted.map((t) => (
          <div
            key={`${t.runDate}-${t.symbol}`}
            className={`${GRID} border-b border-[var(--line)] py-2.5`}
          >
            <p className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">{formatDate(t.runDate)}</p>
            <p className="truncate text-[12px] text-[var(--ink)]">{t.displayName}</p>
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              {TIER_LABEL[t.tier]}
            </p>
            <p className="flex items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em]">
              <span style={{ color: t.fromVerdict ? BULL_VERDICT_META[t.fromVerdict].color : "var(--ink-3)" }}>
                {t.fromVerdict ? BULL_VERDICT_META[t.fromVerdict].short : "—"}
              </span>
              <span className="text-[var(--ink-3)]">→</span>
              <span style={{ color: BULL_VERDICT_META[t.toVerdict].color }}>
                {BULL_VERDICT_META[t.toVerdict].short}
              </span>
            </p>
            <p className="text-right font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
              {rankBySymbol.has(t.symbol) ? `#${rankBySymbol.get(t.symbol)}` : "—"}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-[var(--ink-3)]">
        Rank is today&rsquo;s scan rank, shown for context — the transitions feed
        doesn&rsquo;t carry historical rank, so it isn&rsquo;t the rank at the
        moment each flip happened.
      </p>
    </div>
  );
}
