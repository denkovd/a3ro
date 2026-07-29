"use client";
/* ────────────────────────────────────────────────────────────────
   Heatmap — symbols x RS window, color = RS rank percentile.

   Percentile is computed within each symbol's own tier (rs63 is
   benchmark-relative, so pooling tiers would compare assets against
   two different benchmarks as one group — see rsData.windowPercentilesByTier)
   even when the "All" tab is selected; the tab only changes which
   rows are *displayed*, not the comparison pool.

   Only the 3M column is populated for almost every symbol (the
   API's rs63); 1M/6M/1Y show `no_data` unless a per-symbol daily bar
   series exists (today: BTC-USD only) — an honest empty cell, never
   a fabricated value or a silent zero.
──────────────────────────────────────────────────────────────── */
import { useMemo, useState } from "react";
import { TIER_LABEL, TIER_ORDER, type BullRow, type BullTier } from "../bull/bullData";
import {
  RS_WINDOWS,
  RS_WINDOW_LABEL,
  formatRs,
  percentileColor,
  rsCellsBySymbol,
  windowPercentilesByTier,
  type RsWindow,
} from "./rsData";

type TabKey = "all" | BullTier;
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  ...TIER_ORDER.map((t) => ({ key: t as TabKey, label: TIER_LABEL[t] })),
];

type SortKey = RsWindow;

export default function Heatmap({
  rows,
  seriesWindowsBySymbol,
}: {
  rows: BullRow[];
  seriesWindowsBySymbol: Map<string, Partial<Record<RsWindow, number>>>;
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>(63);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const cellsBySymbol = useMemo(() => rsCellsBySymbol(rows, seriesWindowsBySymbol), [rows, seriesWindowsBySymbol]);
  const pctBySymbol = useMemo(() => windowPercentilesByTier(rows, seriesWindowsBySymbol), [rows, seriesWindowsBySymbol]);

  const displayRows = useMemo(() => (tab === "all" ? rows : rows.filter((r) => r.tier === tab)), [rows, tab]);

  const sorted = useMemo(() => {
    const windowIdx = RS_WINDOWS.indexOf(sortKey);
    const withPct = displayRows.map((r) => ({ row: r, pct: pctBySymbol.get(r.symbol)?.[windowIdx] ?? null }));
    withPct.sort((a, b) => {
      if (a.pct === null && b.pct === null) return 0;
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      return sortDir === "desc" ? b.pct - a.pct : a.pct - b.pct;
    });
    return withPct.map((e) => e.row);
  }, [displayRows, pctBySymbol, sortKey, sortDir]);

  const onSort = (w: RsWindow) => {
    if (sortKey === w) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(w);
      setSortDir("desc");
    }
  };

  if (rows.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-pressed={active}
              className="rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-micro)]"
              style={{
                color: active ? "var(--ink)" : "var(--ink-3)",
                background: active ? "rgba(127, 158, 232, 0.10)" : "transparent",
                border: `1px solid ${active ? "rgba(127, 158, 232, 0.35)" : "var(--line)"}`,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 max-h-[32rem] overflow-y-auto overflow-x-auto" data-lenis-prevent>
        <div className="min-w-[34rem]">
          <div className="grid grid-cols-[minmax(11rem,1.6fr)_5rem_repeat(4,5.5rem)] items-baseline gap-x-2 border-b border-[var(--line)] pb-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Asset</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Tier</p>
            {RS_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => onSort(w)}
                className="text-right font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
              >
                {RS_WINDOW_LABEL[w]}
                {sortKey === w ? (sortDir === "desc" ? " ▾" : " ▴") : ""}
              </button>
            ))}
          </div>

          {sorted.map((r) => {
            const cells = cellsBySymbol.get(r.symbol) ?? [];
            const pcts = pctBySymbol.get(r.symbol) ?? [];
            return (
              <div
                key={r.symbol}
                className="grid grid-cols-[minmax(11rem,1.6fr)_5rem_repeat(4,5.5rem)] items-center gap-x-2 border-b border-[var(--line)] py-1.5"
              >
                <p className="truncate text-[12px] text-[var(--ink)]">{r.displayName}</p>
                <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  {TIER_LABEL[r.tier]}
                </p>
                {RS_WINDOWS.map((w, i) => {
                  const cell = cells[i];
                  const pct = pcts[i];
                  const noData = !cell || cell.source === "no_data";
                  return (
                    <div key={w} className="flex justify-end">
                      <span
                        className="min-w-[3.75rem] rounded-[2px] px-1.5 py-1 text-right font-mono text-[10px] tabular-nums"
                        style={{
                          background: noData ? "transparent" : percentileColor(pct),
                          color: noData ? "var(--ink-3)" : "var(--ink)",
                        }}
                        title={
                          noData
                            ? "no_data — no benchmark-relative 63d reading and no per-symbol bar series for this window"
                            : cell.source === "series"
                              ? "self-return from a per-symbol bar series — not benchmark-relative like RS63"
                              : "RS63 — 63-session return minus tier benchmark"
                        }
                      >
                        {noData ? "no_data" : formatRs(cell.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
