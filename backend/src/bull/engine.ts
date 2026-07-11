/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — engine extensions.

   The Money Line itself is Module 4's verified port, imported
   as-is (regime/engine.ts) — NO fork, no re-derivation. This file
   adds only what P·05 layers on top:

   - ATR%       14-bar Wilder ATR as % of last close
   - strengthVol (cushion% + sinceFlip%) ÷ ATR% — volatility-
                normalized so crypto doesn't structurally outrank
                low-vol indices in the strength tiebreak
   - rs63       63-bar % change minus the benchmark's — context
                column, NOT a ranking gate
   - ranking    same group → recency → strength order as Module 4,
                with strengthVol as the strength input
   - transitions verdict diffs between consecutive runs

   All pure. Display naming (Double Confirmed / Conflicted Early
   Bullish / Conflicted Lagging Bullish) lives in the frontend —
   the shared verdict enums stay untouched so Module 4 is unaffected.
──────────────────────────────────────────────────────────────── */

import { computeRegime } from "../regime/engine";
import { RegimeBar, RegimeSnapshot, RegimeVerdict } from "../regime/types";
import { BullSnapshot, BullTransition, BullUniverseEntry } from "./types";

export const ATR_LEN = 14;
export const RS_LOOKBACK = 63; // ~one quarter of trading days

/** Wilder ATR over the last `len` closed bars, as % of last close. */
export function atrPct(bars: RegimeBar[], len: number = ATR_LEN): number | null {
  if (bars.length < len + 1) return null;
  const trs: number[] = [];
  for (let i = bars.length - len; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose),
    );
    trs.push(tr);
  }
  const atr = trs.reduce((a, b) => a + b, 0) / len;
  const lastClose = bars[bars.length - 1].close;
  if (!Number.isFinite(atr) || lastClose === 0) return null;
  return (atr / Math.abs(lastClose)) * 100;
}

/** % change over the last `lookback` closed bars. */
export function pctChange(bars: RegimeBar[], lookback: number = RS_LOOKBACK): number | null {
  if (bars.length < lookback + 1) return null;
  const then = bars[bars.length - 1 - lookback].close;
  const now = bars[bars.length - 1].close;
  if (then === 0) return null;
  return (now / then - 1) * 100;
}

/**
 * Full P·05 snapshot for one symbol. `benchmarkBars` is the closed
 * daily series of the symbol's RS benchmark (null → rs63 null).
 */
export function computeBullSnapshot(
  entry: BullUniverseEntry,
  closedDaily: RegimeBar[],
  runDate: string,
  benchmarkBars: RegimeBar[] | null,
  adjusted: boolean,
): BullSnapshot {
  const base: RegimeSnapshot = computeRegime(
    { symbol: entry.symbol, displayName: entry.displayName,
      assetClass: entry.assetClass === "etf" ? "equity" : entry.assetClass },
    closedDaily,
    runDate,
  );

  const atr = atrPct(closedDaily);
  const strengthVol =
    base.strength !== null && atr !== null && atr > 0 ? base.strength / atr : null;

  const own = pctChange(closedDaily);
  const bench = benchmarkBars ? pctChange(benchmarkBars) : null;
  const rs63 = own !== null && bench !== null ? own - bench : null;

  return { ...base, tier: entry.tier, atrPct: atr, strengthVol, rs63, adjusted };
}

/* ── ranking: Module 4's order, vol-normalized strength ───────── */

const VERDICT_GROUP: Record<RegimeVerdict, number> = {
  BULLISH: 1, // newly bullish promotes to 0
  CONFLICT_DAILY: 2,
  CONFLICT_WEEKLY: 3,
  BEARISH: 4,
  WARMUP: 5,
};

function groupOf(s: BullSnapshot): number {
  return s.newlyBullish ? 0 : VERDICT_GROUP[s.verdict];
}

function recencyOf(s: BullSnapshot): number {
  switch (s.verdict) {
    case "BULLISH":
    case "BEARISH":
      return s.daysSinceAligned ?? Number.MAX_SAFE_INTEGER;
    case "CONFLICT_DAILY":
      return s.daily.barsSinceFlip ?? Number.MAX_SAFE_INTEGER;
    case "CONFLICT_WEEKLY":
      return (s.weekly.barsSinceFlip ?? Number.MAX_SAFE_INTEGER / 5) * 5;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

/** Newly bullish → bullish → conflicted (D, then W) → bearish →
 *  warm-up; most-recent transition first inside a group; equal
 *  recency resolves by vol-normalized strength (falls back to raw
 *  strength when ATR is unavailable). 1-based ranks. */
export function rankBullSnapshots(snapshots: BullSnapshot[]): BullSnapshot[] {
  const strengthKey = (s: BullSnapshot) => s.strengthVol ?? s.strength ?? -Infinity;
  const ranked = [...snapshots].sort((a, b) => {
    const g = groupOf(a) - groupOf(b);
    if (g !== 0) return g;
    const r = recencyOf(a) - recencyOf(b);
    if (r !== 0) return r;
    const sd = strengthKey(b) - strengthKey(a);
    if (sd !== 0) return sd;
    return a.symbol.localeCompare(b.symbol);
  });
  return ranked.map((s, i) => ({ ...s, rank: i + 1 }));
}

/* ── transitions ──────────────────────────────────────────────── */

/**
 * Verdict changes vs the previous run. Symbols absent from the
 * previous run (first scan, or prior fetch failure) record
 * fromVerdict null. Unchanged verdicts produce no row.
 */
export function computeTransitions(
  previous: Map<string, string>,
  current: BullSnapshot[],
): BullTransition[] {
  const out: BullTransition[] = [];
  for (const s of current) {
    const prev = previous.get(s.symbol) ?? null;
    if (prev === s.verdict) continue;
    if (prev === null && previous.size === 0) {
      // First scan ever: everything would be a "transition" — skip
      // the noise; the feed starts meaning something from run 2.
      continue;
    }
    out.push({
      runDate: s.runDate,
      symbol: s.symbol,
      displayName: s.displayName,
      tier: s.tier,
      fromVerdict: prev,
      toVerdict: s.verdict,
    });
  }
  return out;
}
