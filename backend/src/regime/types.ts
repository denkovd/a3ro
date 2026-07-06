/* ────────────────────────────────────────────────────────────────
   Regime Shift Finder (Module 4) — domain types.
   The trend engine is a TypeScript port of the "BullMania Money
   Line [Recreation]" Pine v6 indicator: Donchian channel CLOSE-flip
   (length 20, ratcheted), evaluated on closed bars only, on two
   timeframes (daily + weekly resampled from daily).
──────────────────────────────────────────────────────────────── */

/** One closed OHLC bar. `date` is the bar's close date, YYYY-MM-DD (UTC). */
export interface RegimeBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** 1 bull · -1 bear · 0 warm-up (not enough history to establish). */
export type Trend = 1 | -1 | 0;

/** A confirmed trend flip (fires on the CLOSE of the crossing bar). */
export interface Flip {
  /** Close date of the bar that confirmed the flip. NOTE: TradingView
   *  stamps weekly flips with time_close (the following Monday); we
   *  stamp with the last trading day inside the week — same candle,
   *  date reads a few days earlier. */
  date: string;
  direction: 1 | -1;
  /** Close price of the confirming bar (the indicator's "Last Flip"). */
  price: number;
  /** Index of the confirming bar in the evaluated series. */
  barIndex: number;
}

/** Money Line state for one timeframe after replaying all closed bars. */
export interface TimeframeState {
  trend: Trend;
  /** Current flip level ("Next Flip" in the original table). */
  line: number | null;
  lastFlipDate: string | null;
  lastFlipPrice: number | null;
  /** Closed bars since the flip bar (0 = flipped on the latest bar). */
  barsSinceFlip: number | null;
  /** (lastClose / lastFlipPrice − 1) × 100 — the table's "Since Flip". */
  sinceFlipPct: number | null;
  /** (lastClose / line − 1) × 100 — signed cushion above the flip level. */
  cushionPct: number | null;
  /** Number of closed bars evaluated (diagnostics). */
  bars: number;
  /** Full flip history, oldest → newest (diagnostics / future UI). */
  flips: Flip[];
}

/**
 * Verdict labels — exactly the module spec:
 *  BULLISH          bullish on daily AND weekly
 *  CONFLICT_DAILY   bullish on daily only
 *  CONFLICT_WEEKLY  bullish on weekly only
 *  BEARISH          bearish on daily AND weekly
 *  WARMUP           either timeframe hasn't established a trend
 */
export type RegimeVerdict =
  | "BULLISH"
  | "CONFLICT_DAILY"
  | "CONFLICT_WEEKLY"
  | "BEARISH"
  | "WARMUP";

export type AssetClass =
  | "crypto"
  | "metals"
  | "energy"
  | "index"
  | "fx"
  | "rates"
  | "equity"
  | "ags";

export interface UniverseEntry {
  /** Yahoo Finance ticker (the fetch layer URL-encodes it). */
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
}

/** One scanned symbol, fully computed. What the repo persists. */
export interface RegimeSnapshot {
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  /** UTC run date the scan is valid for (closed bars strictly before it). */
  runDate: string;
  daily: TimeframeState;
  weekly: TimeframeState;
  verdict: RegimeVerdict;
  /** Date the daily+weekly alignment began (later of the two flips). */
  alignedSince: string | null;
  /** Closed DAILY bars since alignment began. */
  daysSinceAligned: number | null;
  /** Verdict BULLISH and alignment ≤ NEWLY_BULLISH_MAX_AGE bars old. */
  newlyBullish: boolean;
  lastClose: number | null;
  lastCloseDate: string | null;
  /** Strength = daily cushion% + daily since-flip% (tiebreak metric). */
  strength: number | null;
  /** 1-based position after recency-first ranking. */
  rank: number;
}
