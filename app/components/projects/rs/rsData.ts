/* ────────────────────────────────────────────────────────────────
   Relative Strength Matrix — pure data layer.

   Everything here derives from BullRow[] (the same /api/bull/latest
   payload the Bull Market Finder already fetches) plus the local
   scan-history accumulator in rsHistory.ts and the one-symbol series
   feed in rsSeries.ts. No new backend endpoints, no modeled numbers:
   a value that can't be computed from a real feed renders as
   `no_data`, never a fabricated zero.
──────────────────────────────────────────────────────────────── */
import {
  BULL_ACCENT,
  BULL_MUTED_PINK,
  TIER_LABEL,
  TIER_ORDER,
  type BullRow,
  type BullTier,
  type BullVerdict,
} from "../bull/bullData";
import type { ScanEntry, ScanHistory } from "./rsHistory";

export { TIER_LABEL, TIER_ORDER };
export type { BullRow, BullTier, BullVerdict };

/* ── RS windows ──────────────────────────────────────────────────
   63d always comes from the API (`rs63`, benchmark-relative). The
   others require a per-symbol daily bar series, which only exists
   for BTC-USD today (see rsSeries.ts) — everywhere else they stay
   `no_data`. */
export const RS_WINDOWS = [21, 63, 126, 252] as const;
export type RsWindow = (typeof RS_WINDOWS)[number];
export const RS_WINDOW_LABEL: Record<RsWindow, string> = {
  21: "1M",
  63: "3M",
  126: "6M",
  252: "1Y",
};

export type RsCellSource = "api" | "series" | "no_data";
export type RsCell = { window: RsWindow; value: number | null; source: RsCellSource };

/** One row's RS reading across every window. 63d is the API's rs63
 *  (benchmark-relative return); the client-computed windows (from
 *  `seriesWindows`, when present) are self-return, not benchmark-
 *  relative — a genuinely different quantity, kept honestly labeled
 *  wherever it's displayed rather than blended into one number. */
export function rsCellsForRow(
  row: BullRow,
  seriesWindows: Partial<Record<RsWindow, number>> | undefined,
): RsCell[] {
  return RS_WINDOWS.map((w) => {
    if (w === 63) {
      return { window: w, value: row.rs63, source: row.rs63 === null ? "no_data" : "api" };
    }
    const v = seriesWindows?.[w];
    return v === undefined
      ? { window: w, value: null, source: "no_data" }
      : { window: w, value: v, source: "series" };
  });
}

/* ── percentile ranks ────────────────────────────────────────────
   Fractional rank (ties share the average percentile), 0..100,
   1 decimal. A missing value never gets a percentile — null in,
   null out — so a `no_data` cell can't silently read as "weak". */
export function percentileRank(value: number | null, pool: (number | null)[]): number | null {
  if (value === null) return null;
  const nums = pool.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of nums) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  const rank = (below + equal / 2) / nums.length;
  return Math.round(rank * 1000) / 10;
}

/** rs63 percentile per symbol, tier-scoped by default (rs63 is
 *  already benchmark-relative — ranking across tiers would compare
 *  assets against two different benchmarks as if they were one
 *  pool). Pass `global: true` to rank the whole visible set instead
 *  (used when a tier filter has already narrowed the pool to one). */
export function rs63PercentileBySymbol(
  rows: BullRow[],
  opts: { global?: boolean } = {},
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (opts.global) {
    const pool = rows.map((r) => r.rs63);
    for (const r of rows) out.set(r.symbol, percentileRank(r.rs63, pool));
    return out;
  }
  const byTier = new Map<BullTier, number[]>();
  for (const r of rows) {
    if (r.rs63 === null) continue;
    const arr = byTier.get(r.tier);
    if (arr) arr.push(r.rs63);
    else byTier.set(r.tier, [r.rs63]);
  }
  for (const r of rows) {
    out.set(r.symbol, percentileRank(r.rs63, byTier.get(r.tier) ?? []));
  }
  return out;
}

/** Raw RS cells per symbol (window x value x source) for every row
 *  passed in — the heatmap's data rows. */
export function rsCellsBySymbol(
  rows: BullRow[],
  seriesWindowsBySymbol: Map<string, Partial<Record<RsWindow, number>>>,
): Map<string, RsCell[]> {
  const out = new Map<string, RsCell[]>();
  for (const r of rows) out.set(r.symbol, rsCellsForRow(r, seriesWindowsBySymbol.get(r.symbol)));
  return out;
}

/** Percentile per symbol per window, pool-scoped per window across
 *  the rows passed in (caller decides tier scope by pre-filtering
 *  `rows` before calling `rsCellsBySymbol`). Index-aligned with
 *  `RS_WINDOWS`. Used by the heatmap for cell color. */
export function windowPercentilesBySymbol(
  cellsBySymbol: Map<string, RsCell[]>,
): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  for (const symbol of cellsBySymbol.keys()) out.set(symbol, new Array(RS_WINDOWS.length).fill(null));
  RS_WINDOWS.forEach((_, i) => {
    const pool = Array.from(cellsBySymbol.values(), (cells) => cells[i]?.value ?? null);
    for (const [symbol, cells] of cellsBySymbol.entries()) {
      out.get(symbol)![i] = percentileRank(cells[i]?.value ?? null, pool);
    }
  });
  return out;
}

/** Percentile per symbol per window, scoped per-tier (never pooling
 *  two tiers' 63d readings together, since rs63 is relative to a
 *  tier-specific benchmark) regardless of which rows the caller
 *  chooses to *display*. Pass the full visible universe in; filter
 *  the render list separately. */
export function windowPercentilesByTier(
  rows: BullRow[],
  seriesWindowsBySymbol: Map<string, Partial<Record<RsWindow, number>>>,
): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  const byTier = new Map<BullTier, BullRow[]>();
  for (const r of rows) {
    const arr = byTier.get(r.tier);
    if (arr) arr.push(r);
    else byTier.set(r.tier, [r]);
  }
  for (const tierRows of byTier.values()) {
    const cells = rsCellsBySymbol(tierRows, seriesWindowsBySymbol);
    const pct = windowPercentilesBySymbol(cells);
    for (const [symbol, values] of pct.entries()) out.set(symbol, values);
  }
  return out;
}

/** Diverging percentile color — reuses the app's existing bull/bear
 *  pair (BULL_ACCENT / BULL_MUTED_PINK) rather than inventing a new
 *  ramp: percentile has a meaningful center (the 50th), so this is a
 *  diverging read (leading vs lagging), not a plain sequential one.
 *  `null` (no_data) renders as an empty cell, never a color. */
export function percentileColor(pct: number | null): string {
  if (pct === null) return "transparent";
  const t = (pct - 50) / 50; // -1..1
  if (Math.abs(t) < 6 / 50) return "var(--ink-3)";
  const alpha = 0.12 + Math.min(Math.abs(t), 1) * 0.55;
  return t > 0 ? `rgba(127, 158, 232, ${alpha.toFixed(2)})` : `rgba(168, 73, 107, ${alpha.toFixed(2)})`;
}

/* ── per-tier verdict-count strip (Regime-Monitor salvage) ──────
   "bull-leaning" = anything not outright bearish or still warming
   up: double-confirmed + both conflicted states, since all three
   carry at least one bullish leg. Denominator is every scanned
   symbol in the tier, warm-up included — an honest "of how many". */
export type TierVerdictCount = { tier: BullTier; bull: number; total: number };

const BULL_LEANING: readonly BullVerdict[] = ["BULLISH", "CONFLICT_DAILY", "CONFLICT_WEEKLY"];

export function tierVerdictCounts(rows: BullRow[]): TierVerdictCount[] {
  const counts = new Map<BullTier, { bull: number; total: number }>();
  for (const tier of TIER_ORDER) counts.set(tier, { bull: 0, total: 0 });
  for (const r of rows) {
    const c = counts.get(r.tier);
    if (!c) continue;
    c.total++;
    if (BULL_LEANING.includes(r.verdict)) c.bull++;
  }
  return TIER_ORDER.map((tier) => ({ tier, ...(counts.get(tier) as { bull: number; total: number }) }));
}

export const TIER_SHORT: Record<BullTier, string> = {
  macro: "macro",
  us_large: "us",
  ndx_extra: "ndx+",
  crypto: "crypto",
  etf: "etf",
};

/* ── RS momentum (from local scan history) ──────────────────────
   Momentum = change in rs63 between the earliest and latest scan
   this browser has recorded for the symbol. Needs 2+ distinct
   scans; with 0-1 it's `warming_up`, never a fabricated 0. */
export type RsMomentum = { value: number | null; scans: number; state: "ready" | "warming_up" };

export function rsMomentum(history: ScanEntry[] | undefined): RsMomentum {
  if (!history || history.length < 2) {
    return { value: null, scans: history?.length ?? 0, state: "warming_up" };
  }
  const first = history[0];
  const last = history[history.length - 1];
  if (first.rs63 === null || last.rs63 === null) {
    return { value: null, scans: history.length, state: "warming_up" };
  }
  return { value: last.rs63 - first.rs63, scans: history.length, state: "ready" };
}

export type LeadershipEntry = { row: BullRow; momentum: RsMomentum };
export type LeadershipRanking = {
  top: LeadershipEntry[];
  bottom: LeadershipEntry[];
  mode: "momentum" | "rs63_fallback";
};

/** Top-5 / bottom-5 by RS momentum once local scan history has
 *  enough depth (>=5 symbols with 2+ recorded scans); otherwise
 *  falls back to ranking by raw rs63 so the strip isn't empty on a
 *  visitor's first-ever visit — clearly flagged via `mode` so the
 *  UI can label it "warming up" rather than pass it off as momentum. */
export function leadershipRanking(rows: BullRow[], history: ScanHistory): LeadershipRanking {
  const withMomentum: LeadershipEntry[] = rows.map((row) => ({
    row,
    momentum: rsMomentum(history[row.symbol]),
  }));
  const ready = withMomentum.filter((e) => e.momentum.state === "ready");
  if (ready.length >= 5) {
    const sorted = [...ready].sort((a, b) => (b.momentum.value as number) - (a.momentum.value as number));
    return { top: sorted.slice(0, 5), bottom: sorted.slice(-5).reverse(), mode: "momentum" };
  }
  const byRs: LeadershipEntry[] = rows
    .filter((r) => r.rs63 !== null)
    .map((row) => ({
      row,
      momentum: { value: row.rs63, scans: history[row.symbol]?.length ?? 0, state: "warming_up" as const },
    }))
    .sort((a, b) => (b.row.rs63 as number) - (a.row.rs63 as number));
  return { top: byRs.slice(0, 5), bottom: byRs.slice(-5).reverse(), mode: "rs63_fallback" };
}

export function momentumColor(v: number | null): string {
  if (v === null) return "var(--ink-3)";
  if (v > 0) return BULL_ACCENT;
  if (v < 0) return BULL_MUTED_PINK;
  return "var(--ink-2)";
}

/* ── quadrant view (RRG-style) ──────────────────────────────────
   x = rs63 (already benchmark-relative); y = RS momentum from local
   scan history. A symbol only gets a trail once its local history
   holds 2+ scans with non-null rs63 — otherwise it's a single point,
   per spec ("do not fabricate trails"). */
export type QuadrantPoint = { runDate: string; x: number; y: number };
export type QuadrantSeries = { row: BullRow; points: QuadrantPoint[] };

export function quadrantSeriesForRow(row: BullRow, history: ScanEntry[] | undefined): QuadrantSeries {
  if (!history || history.length === 0) {
    return row.rs63 === null ? { row, points: [] } : { row, points: [{ runDate: row.runDate, x: row.rs63, y: 0 }] };
  }
  const withRs = history.filter((h): h is ScanEntry & { rs63: number } => h.rs63 !== null);
  if (withRs.length === 0) {
    return row.rs63 === null ? { row, points: [] } : { row, points: [{ runDate: row.runDate, x: row.rs63, y: 0 }] };
  }
  const points: QuadrantPoint[] = withRs.map((h, i) => ({
    runDate: h.runDate,
    x: h.rs63,
    y: i === 0 ? 0 : h.rs63 - withRs[i - 1].rs63,
  }));
  return { row, points };
}

/* ── display helpers ─────────────────────────────────────────────
   Mirrors bullData.ts's formatPct/formatX exactly (same rounding
   rule) so numbers read identically across both modules. */
export const formatRs = (v: number | null): string => {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)}%`;
};

export const formatPercentile = (v: number | null): string => (v === null ? "—" : `${v.toFixed(0)}`);
