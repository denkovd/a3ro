/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — column registry + sorting (P·02).

   One source of truth for every table column: header label,
   alignment, the lens-aware explanation shown on hover/focus, and
   the sort key. view.tsx renders headers and rows from this list so
   they can't drift apart.

   Sorting is pure and dependency-free (type-only imports) so it can
   be unit-tested by transpiling this file on its own
   (tests/bull-columns.test.mjs). Rules:
   - null sort state = the server ranking (rank asc, grouped)
   - missing values (null) ALWAYS sort last, in both directions —
     e.g. RS 63d is null for FX / rates / commodities
   - ties resolve by server rank, so order is always deterministic
   - Last close is deliberately not sortable (prices of unrelated
     assets aren't comparable)
──────────────────────────────────────────────────────────────── */
import type { BullRow, StrategyTimeframe } from "./bullData";

export type SortKey =
  | "rank" | "asset" | "state" | "d" | "w"
  | "confirmed" | "strVol" | "rs63" | "lens";
export type SortDir = "asc" | "desc";
/** null = default server ranking. */
export type SortState = { key: SortKey; dir: SortDir } | null;

export type BullColumn = {
  id: string;
  label: string;
  align: "left" | "right";
  sortKey: SortKey | null;
  tip: (tf: StrategyTimeframe) => string;
};

const legName = (tf: StrategyTimeframe) => (tf === "weekly" ? "weekly" : "daily");

export const BULL_COLUMNS: BullColumn[] = [
  {
    id: "rank", label: "Rank", align: "left", sortKey: "rank",
    tip: () =>
      "Position in the active lens's ranking: newly bullish first, then confirmed bullish, " +
      "conflicted, bearish and warm-up. Within each group the most recent confirmation " +
      "ranks first; ties are broken by Str ×vol.",
  },
  {
    id: "asset", label: "Asset", align: "left", sortKey: "asset",
    tip: () => "Asset name and its universe tier. NEW marks a bullish confirmation within the last 10 sessions.",
  },
  {
    id: "state", label: "State", align: "left", sortKey: "state",
    tip: (tf) =>
      tf === "multi"
        ? "Money Line verdict on daily × weekly. DOUBLE: bullish on both. EARLY: daily has " +
          "flipped bullish, weekly hasn't yet. LAGGING: weekly still bullish, daily has broken. " +
          "BEARISH: bearish on both. Sorting puts the most bullish states first."
        : `Money Line verdict on ${legName(tf)} closes only: BULL, BEAR or WARMUP (not enough ` +
          "history). One leg can't conflict with itself, so there are no conflicted states here.",
  },
  {
    id: "d", label: "D", align: "left", sortKey: "d",
    tip: (tf) =>
      "Daily Money Line direction: ▲ bullish, ▼ bearish, · warm-up." +
      (tf === "weekly" ? " Dimmed: the weekly lens doesn't rank on this leg." : ""),
  },
  {
    id: "w", label: "W", align: "left", sortKey: "w",
    tip: (tf) =>
      "Weekly Money Line direction: ▲ bullish, ▼ bearish, · warm-up. The forming week never counts." +
      (tf === "daily" ? " Dimmed: the daily lens doesn't rank on this leg." : ""),
  },
  {
    id: "confirmed", label: "Confirmed / Flip", align: "left", sortKey: "confirmed",
    tip: (tf) =>
      tf === "multi"
        ? "When daily and weekly last aligned, and trading days since. For conflicted assets: " +
          "the date the leg that flipped did so (D = daily, W = weekly). Sorting puts the most recent first."
        : `Date of the last ${legName(tf)} flip and trading days since` +
          (tf === "weekly" ? " (weekly bars × 5)." : ".") +
          " Sorting puts the most recent first.",
  },
  {
    id: "strVol", label: "Str ×vol", align: "right", sortKey: "strVol",
    tip: (tf) =>
      "Trend strength in units of normal volatility: (distance above the " +
      `${tf === "weekly" ? "weekly" : "daily"} flip level % + move since that flip %) ÷ 14-day ATR %. ` +
      "Higher = deeper into an established trend. Volatility-adjusted so crypto doesn't outrank " +
      "quieter assets just by moving more. Used only to break ranking ties.",
  },
  {
    id: "rs63", label: "RS 63d", align: "right", sortKey: "rs63",
    tip: () =>
      "Relative strength: the asset's return over the last 63 trading days (~one quarter) minus " +
      "its benchmark's — S&P 500 for stocks, ETFs and indices; BTC for crypto. Positive = " +
      "outperforming. Blank for FX, rates and commodities (no natural benchmark). Context only, " +
      "not a ranking input.",
  },
  {
    id: "lens", label: "Lens", align: "right", sortKey: "lens",
    tip: () =>
      "Consensus across all strategy lenses (D×W, Weekly, Daily) on this run, e.g. 2/3 = two " +
      "lenses read it bullish. Conflicted or warm-up counts as neutral. Blue = all agree bullish, " +
      "amber = lenses disagree, pink = mostly bearish.",
  },
  {
    id: "close", label: "Last close", align: "right", sortKey: null,
    tip: () =>
      "Most recent closed daily bar. Futures (WTI, gold) are roll-adjusted continuous series.",
  },
];

/* ── sort values ───────────────────────────────────────────────── */

/** Higher = more bullish. WARMUP → null so it sorts last both ways. */
function stateScore(r: BullRow): number | null {
  if (r.newlyBullish) return 5;
  switch (r.verdict) {
    case "BULLISH": return 4;
    case "CONFLICT_DAILY": return 3;
    case "CONFLICT_WEEKLY": return 2;
    case "BEARISH": return 1;
    default: return null;
  }
}

/** Warm-up (0) and missing → null. */
const trendValue = (t: number | null): number | null => (t === 1 || t === -1 ? t : null);

/** The date the Confirmed / Flip cell shows (YYYY-MM-DD sorts lexically). */
function confirmedDate(r: BullRow): string | null {
  if (r.verdict === "CONFLICT_DAILY") return r.dailyFlipDate;
  if (r.verdict === "CONFLICT_WEEKLY") return r.weeklyFlipDate;
  return r.alignedSince;
}

/** Net bullishness across lenses: (bull − bear) / of. */
function lensScore(r: BullRow): number | null {
  const c = r.consensus;
  return c.of > 0 ? (c.bull - c.bear) / c.of : null;
}

export function sortValue(r: BullRow, key: SortKey): number | string | null {
  switch (key) {
    case "rank": return r.rank;
    case "asset": return r.displayName;
    case "state": return stateScore(r);
    case "d": return trendValue(r.dailyTrend);
    case "w": return trendValue(r.weeklyTrend);
    case "confirmed": return confirmedDate(r);
    case "strVol": return r.strengthVol;
    case "rs63": return r.rs63;
    case "lens": return lensScore(r);
  }
}

/** First-click direction per key: the "most interesting first" order. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  rank: "asc",
  asset: "asc",
  state: "desc",
  d: "desc",
  w: "desc",
  confirmed: "desc",
  strVol: "desc",
  rs63: "desc",
  lens: "desc",
};

export function compareRows(a: BullRow, b: BullRow, sort: SortState): number {
  if (sort === null) return a.rank - b.rank;
  const va = sortValue(a, sort.key);
  const vb = sortValue(b, sort.key);
  const aMissing = va === null || (typeof va === "number" && !Number.isFinite(va));
  const bMissing = vb === null || (typeof vb === "number" && !Number.isFinite(vb));
  if (aMissing || bMissing) {
    if (aMissing && bMissing) return a.rank - b.rank;
    return aMissing ? 1 : -1; // missing last, regardless of direction
  }
  const cmp =
    typeof va === "string" && typeof vb === "string"
      ? va.localeCompare(vb)
      : (va as number) - (vb as number);
  if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
  return a.rank - b.rank;
}

export function sortRows<T extends BullRow>(rows: T[], sort: SortState): T[] {
  return [...rows].sort((a, b) => compareRows(a, b, sort));
}

/** True when the table is in the server's grouped ranking order. */
export const isDefaultOrder = (sort: SortState): boolean =>
  sort === null || (sort.key === "rank" && sort.dir === "asc");

/**
 * Header click cycle: default direction → reversed → back to ranking.
 * Rank's default direction IS the ranking, so it toggles
 * ranking ↔ reversed ranking.
 */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (key === "rank") {
    return current?.key === "rank" && current.dir === "desc" ? null : { key: "rank", dir: "desc" };
  }
  if (current?.key !== key) return { key, dir: DEFAULT_DIR[key] };
  if (current.dir === DEFAULT_DIR[key]) {
    return { key, dir: DEFAULT_DIR[key] === "asc" ? "desc" : "asc" };
  }
  return null;
}

const SORT_KEYS = new Set<string>(Object.keys(DEFAULT_DIR));

/** URL params → SortState; anything unknown falls back to ranking. */
export function parseSort(key: string | null, dir: string | null): SortState {
  if (!key || !SORT_KEYS.has(key)) return null;
  const d: SortDir = dir === "asc" || dir === "desc" ? dir : DEFAULT_DIR[key as SortKey];
  const s: SortState = { key: key as SortKey, dir: d };
  return isDefaultOrder(s) ? null : s;
}

export const sortLabel = (key: SortKey): string =>
  BULL_COLUMNS.find((c) => c.sortKey === key)?.label ?? key;
