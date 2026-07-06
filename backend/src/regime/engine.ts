/* ────────────────────────────────────────────────────────────────
   Money Line trend engine — faithful TypeScript port of the
   "BullMania Money Line [Recreation]" Pine v6 Donchian close-flip.

   Pine semantics preserved exactly:
   - Channel = highest high / lowest low of the last N *closed* bars,
     EXCLUDING the bar being evaluated (Pine: ta.highest(high, N)[1]).
   - The line RATCHETS: floor only rises in an uptrend, ceiling only
     falls in a downtrend, resetting at each flip.
   - Order of operations per bar: ratchet the line with the current
     channel value FIRST, then compare the close against it.
   - A flip fires only on the CLOSE of the crossing bar; on a flip
     the line resets to the opposite channel edge of that same bar's
     lookback window.
   - Warm-up (trend 0) resolves on the first close outside the
     channel — Pine's flipBull/flipBear fire there too (trendPrev 0),
     so that first establishment IS recorded as a flip.

   Everything here is pure and deterministic — no clock, no IO.
──────────────────────────────────────────────────────────────── */

import {
  Flip,
  RegimeBar,
  RegimeSnapshot,
  RegimeVerdict,
  TimeframeState,
  Trend,
  UniverseEntry,
} from "./types";

/** Indicator defaults, calibrated on BTC 1W in the Pine header.
 *  18–21 are indistinguishable there; <18 produces a false bearish
 *  flip on the late-Jun-2024 weekly close. Same length on both
 *  timeframes, matching the indicator's request.security usage. */
export const DONCHIAN_LEN = 20;

/** "Newly bullish" = daily+weekly aligned bull for ≤ this many
 *  closed daily bars (~2 trading weeks). */
export const NEWLY_BULLISH_MAX_AGE = 10;

/* ── core state machine ───────────────────────────────────────── */

export function runMoneyLine(
  bars: RegimeBar[],
  donLen: number = DONCHIAN_LEN,
  ratchet: boolean = true,
): TimeframeState {
  let trend: Trend = 0;
  let line: number | null = null;
  const flips: Flip[] = [];

  for (let i = donLen; i < bars.length; i++) {
    // Channel of the donLen bars ENDING AT THE PREVIOUS bar (Pine [1]).
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - donLen; j < i; j++) {
      if (bars[j].high > hh) hh = bars[j].high;
      if (bars[j].low < ll) ll = bars[j].low;
    }
    const close = bars[i].close;

    if (trend === 1) {
      line = ratchet ? Math.max(line ?? ll, ll) : ll; // floor only rises
      if (close < line) {
        trend = -1;
        line = hh;
        flips.push({ date: bars[i].date, direction: -1, price: close, barIndex: i });
      }
    } else if (trend === -1) {
      line = ratchet ? Math.min(line ?? hh, hh) : hh; // ceiling only falls
      if (close > line) {
        trend = 1;
        line = ll;
        flips.push({ date: bars[i].date, direction: 1, price: close, barIndex: i });
      }
    } else {
      // Warm-up: establish on the first close outside the channel.
      if (close > hh) {
        trend = 1;
        line = ll;
        flips.push({ date: bars[i].date, direction: 1, price: close, barIndex: i });
      } else if (close < ll) {
        trend = -1;
        line = hh;
        flips.push({ date: bars[i].date, direction: -1, price: close, barIndex: i });
      }
    }
  }

  const last = bars.length > 0 ? bars[bars.length - 1] : null;
  const lastFlip = flips.length > 0 ? flips[flips.length - 1] : null;
  const lastClose = last?.close ?? null;

  return {
    trend,
    line,
    lastFlipDate: lastFlip?.date ?? null,
    lastFlipPrice: lastFlip?.price ?? null,
    barsSinceFlip: lastFlip ? bars.length - 1 - lastFlip.barIndex : null,
    sinceFlipPct:
      lastFlip && lastClose !== null && lastFlip.price !== 0
        ? (lastClose / lastFlip.price - 1) * 100
        : null,
    cushionPct:
      line !== null && line !== 0 && lastClose !== null
        ? (lastClose / line - 1) * 100
        : null,
    bars: bars.length,
    flips,
  };
}

/* ── closed-bar hygiene ───────────────────────────────────────── */

/** Drop the forming daily bar: keep bars strictly BEFORE the run date.
 *  At the 06:00 UTC cron, crypto's current UTC-day bar is forming
 *  (dropped) and every settled session (equities' Friday, crypto's
 *  yesterday) is kept. */
export function closedDailyBars(bars: RegimeBar[], runDate: string): RegimeBar[] {
  return bars.filter((b) => b.date < runDate);
}

/** Monday of the ISO week containing a YYYY-MM-DD date (UTC). */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/**
 * Resample closed daily bars into Monday-anchored weekly bars,
 * excluding the week containing the run date (still forming — a
 * weekly flip only confirms on the weekly CLOSE). A crypto week
 * closed on Sunday and an equity week closed on Friday both become
 * visible on the following Monday's run, mirroring how the weekly
 * candle closes on TradingView.
 * The weekly bar's `date` is the last trading day inside the week.
 */
export function resampleWeekly(dailyBars: RegimeBar[], runDate: string): RegimeBar[] {
  const currentWeek = weekStartOf(runDate);
  const weeks = new Map<string, RegimeBar>();
  const order: string[] = [];

  for (const bar of dailyBars) {
    const wk = weekStartOf(bar.date);
    if (wk >= currentWeek) continue; // forming (or future) week
    const acc = weeks.get(wk);
    if (!acc) {
      weeks.set(wk, { ...bar });
      order.push(wk);
    } else {
      acc.high = Math.max(acc.high, bar.high);
      acc.low = Math.min(acc.low, bar.low);
      acc.close = bar.close; // bars arrive oldest → newest
      acc.date = bar.date;
    }
  }
  return order.map((wk) => weeks.get(wk)!);
}

/* ── verdict + snapshot ───────────────────────────────────────── */

export function verdictOf(daily: Trend, weekly: Trend): RegimeVerdict {
  if (daily === 0 || weekly === 0) return "WARMUP";
  if (daily === 1 && weekly === 1) return "BULLISH";
  if (daily === 1) return "CONFLICT_DAILY";
  if (weekly === 1) return "CONFLICT_WEEKLY";
  return "BEARISH";
}

/**
 * Compute the full regime snapshot for one symbol from raw daily
 * bars (oldest → newest; the forming bar may be present — it is
 * stripped here). Deterministic given (bars, runDate).
 */
export function computeRegime(
  entry: UniverseEntry,
  rawDailyBars: RegimeBar[],
  runDate: string,
  donLen: number = DONCHIAN_LEN,
): RegimeSnapshot {
  const daily = closedDailyBars(rawDailyBars, runDate);
  const weekly = resampleWeekly(daily, runDate);

  const d = runMoneyLine(daily, donLen);
  const w = runMoneyLine(weekly, donLen);
  const verdict = verdictOf(d.trend, w.trend);

  // Alignment = the later of the two flips that produced the current
  // aligned state. Measured in closed DAILY bars so daily and weekly
  // flips are comparable.
  let alignedSince: string | null = null;
  let daysSinceAligned: number | null = null;
  if ((verdict === "BULLISH" || verdict === "BEARISH") && d.lastFlipDate && w.lastFlipDate) {
    alignedSince = d.lastFlipDate > w.lastFlipDate ? d.lastFlipDate : w.lastFlipDate;
    const since = alignedSince;
    daysSinceAligned = daily.reduce((n, b) => (b.date > since ? n + 1 : n), 0);
  }

  const newlyBullish =
    verdict === "BULLISH" &&
    daysSinceAligned !== null &&
    daysSinceAligned <= NEWLY_BULLISH_MAX_AGE;

  const last = daily.length > 0 ? daily[daily.length - 1] : null;
  const strength =
    d.cushionPct !== null && d.sinceFlipPct !== null
      ? d.cushionPct + d.sinceFlipPct
      : (d.cushionPct ?? d.sinceFlipPct);

  return {
    symbol: entry.symbol,
    displayName: entry.displayName,
    assetClass: entry.assetClass,
    runDate,
    daily: d,
    weekly: w,
    verdict,
    alignedSince,
    daysSinceAligned,
    newlyBullish,
    lastClose: last?.close ?? null,
    lastCloseDate: last?.date ?? null,
    strength,
    rank: 0, // assigned by rankSnapshots
  };
}

/* ── ranking: recency first, strength breaks ties ─────────────── */

const VERDICT_GROUP: Record<RegimeVerdict, number> = {
  BULLISH: 1, // split into 0 (newly) / 1 below
  CONFLICT_DAILY: 2,
  CONFLICT_WEEKLY: 3,
  BEARISH: 4,
  WARMUP: 5,
};

function groupOf(s: RegimeSnapshot): number {
  if (s.newlyBullish) return 0;
  return VERDICT_GROUP[s.verdict];
}

/** Recency inside a group: fewer bars since the state began = higher. */
function recencyOf(s: RegimeSnapshot): number {
  switch (s.verdict) {
    case "BULLISH":
    case "BEARISH":
      return s.daysSinceAligned ?? Number.MAX_SAFE_INTEGER;
    case "CONFLICT_DAILY":
      return s.daily.barsSinceFlip ?? Number.MAX_SAFE_INTEGER;
    case "CONFLICT_WEEKLY":
      // weekly bars → daily-comparable scale
      return (s.weekly.barsSinceFlip ?? Number.MAX_SAFE_INTEGER / 5) * 5;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Sort: newly bullish → bullish → conflicted (daily-only, then
 * weekly-only) → bearish → warm-up. Within a group most-recent
 * transition first; equal recency resolves by strength (desc).
 * Returns a new array with 1-based ranks assigned.
 */
export function rankSnapshots(snapshots: RegimeSnapshot[]): RegimeSnapshot[] {
  const ranked = [...snapshots].sort((a, b) => {
    const g = groupOf(a) - groupOf(b);
    if (g !== 0) return g;
    const r = recencyOf(a) - recencyOf(b);
    if (r !== 0) return r;
    const sa = a.strength ?? -Infinity;
    const sb = b.strength ?? -Infinity;
    if (sb !== sa) return sb - sa;
    return a.symbol.localeCompare(b.symbol); // stable, deterministic
  });
  return ranked.map((s, i) => ({ ...s, rank: i + 1 }));
}
