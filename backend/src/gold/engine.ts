/* ────────────────────────────────────────────────────────────────
   Gold engine — pure, deterministic, no IO (mirrors the posture of
   macro/engine.ts and scores/engine.ts).

   Two data sources feed this, both already fetched elsewhere in the
   cycle (ingest/goldCycle.ts) so nothing here does IO:
   - `history`: gold_prices, a daily-close series sourced entirely from
     FRED's keyless GOLDAMGBD228NLBM (sources/fredGold.ts). Deep,
     free, decades available after one backfill — this is what makes
     1Y/5Y/10Y changes and trend/momentum/volatility live from day
     one instead of after years of accumulation.
   - `macroPanel`: the same FRED macro panel sources/fredMacro.ts
     already fetches for P·06/Macro Override (dollar_broad, rates_10y,
     inflation_breakeven) — reused here, not re-fetched.
   - `live`: an optional GoldAPI.io tick (sources/goldapi.ts), used
     ONLY for the headline price/asOf and today's % change (genuinely
     live, vs FRED's daily close). Deliberately never blended into
     `history` — settlement-series math (w1/y1/y5/y10, trend,
     momentum, volatility) always reads the FRED series alone, so a
     missing/failed GoldAPI call degrades the headline gracefully
     without ever corrupting the deep history.

   Every indicator leg is a fixed, documented scale (no history-
   fitting) — same "legible, least-overfit" convention as
   computeMacroPressure's legs — and returns null rather than a
   fabricated reading when it doesn't have enough data yet.
──────────────────────────────────────────────────────────────── */

import { daysBefore, latestObs, pctChange, valueOnOrBefore } from "../core/seriesMath";
import { MacroSeries } from "../sources/fredMacro";

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

export interface GoldPricePoint {
  date: string; // "YYYY-MM-DD"
  value: number;
}

export interface GoldLiveTick {
  price: number;
  changeDayPct: number | null;
  asOf: string; // ISO-8601 UTC
}

export interface GoldChanges {
  d1: number | null;
  w1: number | null;
  y1: number | null;
  y5: number | null;
  y10: number | null;
}

/** state/score/bias — the exact shape the frontend's IndicatorReading
 *  expects, plus the raw value/note for storage and diagnostics. */
export interface GoldIndicator {
  state: string;
  score: number; // 0..1
  bias: -1 | 0 | 1;
  value: number | null;
  note: string;
}

export interface GoldEngineSnapshot {
  runDate: string;
  price: number | null;
  priceAsOf: string | null;
  changes: GoldChanges;
  indicators: {
    trend: GoldIndicator | null;
    momentum: GoldIndicator | null;
    volatility: GoldIndicator | null;
    usdPressure: GoldIndicator | null;
    realYieldPressure: GoldIndicator | null;
  };
}

/* ── changes (d1/w1/y1/y5/y10) ────────────────────────────────────
   d1 prefers the live GoldAPI tick's own chp (a genuine intraday
   read); everything else always comes from the FRED history series,
   never the live tick — so a day GoldAPI fails still yields correct
   w1/y1/y5/y10. */

function changeOverHistory(history: GoldPricePoint[], days: number): number | null {
  const latest = latestObs(history);
  if (!latest) return null;
  const then = valueOnOrBefore(history, daysBefore(latest.date, days));
  if (!then) return null;
  const pct = pctChange(latest.value, then.value);
  return pct === null ? null : round(pct, 2);
}

export function computeGoldChanges(
  history: GoldPricePoint[],
  live: GoldLiveTick | null,
): GoldChanges {
  const d1FromLive = live && live.changeDayPct !== null ? round(live.changeDayPct, 2) : null;
  return {
    d1: d1FromLive ?? changeOverHistory(history, 1),
    w1: changeOverHistory(history, 7),
    y1: changeOverHistory(history, 365),
    y5: changeOverHistory(history, 365 * 5),
    y10: changeOverHistory(history, 365 * 10),
  };
}

/* ── headline price/asOf ──────────────────────────────────────────
   Live tick wins when present (freshest); else the newest FRED
   close, with a nominal London-fix asOf for that date. */

export function resolveHeadlinePrice(
  history: GoldPricePoint[],
  live: GoldLiveTick | null,
): { price: number | null; asOf: string | null } {
  if (live) return { price: live.price, asOf: live.asOf };
  const latest = latestObs(history);
  return latest ? { price: latest.value, asOf: `${latest.date}T15:00:00Z` } : { price: null, asOf: null };
}

/* ── indicator legs ────────────────────────────────────────────── */

const TREND_MIN_POINTS = 40;
const TREND_WINDOW = 200; // trailing sessions for the moving average
/** Trend — latest close vs its own trailing 200-session mean, fixed
 *  scale: −10% below → 0 (headwind/falling), +10% above → 1
 *  (tailwind/rising). */
export function computeTrend(history: GoldPricePoint[]): GoldIndicator | null {
  if (history.length < TREND_MIN_POINTS) return null;
  const latest = latestObs(history) as GoldPricePoint;
  const window = history.slice(-TREND_WINDOW);
  const mean = window.reduce((a, p) => a + p.value, 0) / window.length;
  if (mean === 0) return null;
  const pctAboveMean = ((latest.value - mean) / mean) * 100;
  const normalized = clamp01((pctAboveMean + 10) / 20);
  const bias: -1 | 0 | 1 = normalized > 0.6 ? 1 : normalized < 0.4 ? -1 : 0;
  const state = bias === 1 ? "Rising" : bias === -1 ? "Falling" : "Flat";
  return {
    state,
    score: round(normalized, 4),
    bias,
    value: round(pctAboveMean, 2),
    note: `vs ${window.length}-session mean · scale −10%→0, +10%→1`,
  };
}

const MOMENTUM_WINDOW_DAYS = 90;
/** Momentum — acceleration of the 90-day return (this 90d window's
 *  % change vs the prior 90d window's), fixed scale: −10pp → 0
 *  (fading), +10pp → 1 (building). */
export function computeMomentum(history: GoldPricePoint[]): GoldIndicator | null {
  const latest = latestObs(history);
  if (!latest) return null;
  const mid = valueOnOrBefore(history, daysBefore(latest.date, MOMENTUM_WINDOW_DAYS));
  const prior = valueOnOrBefore(history, daysBefore(latest.date, MOMENTUM_WINDOW_DAYS * 2));
  if (!mid || !prior) return null;
  const curRet = pctChange(latest.value, mid.value);
  const priorRet = pctChange(mid.value, prior.value);
  if (curRet === null || priorRet === null) return null;
  const momentum = curRet - priorRet;
  const normalized = clamp01((momentum + 10) / 20);
  const bias: -1 | 0 | 1 = normalized > 0.6 ? 1 : normalized < 0.4 ? -1 : 0;
  const state = bias === 1 ? "Building" : bias === -1 ? "Fading" : "Steady";
  return {
    state,
    score: round(normalized, 4),
    bias,
    value: round(momentum, 2),
    note: `Δ ${MOMENTUM_WINDOW_DAYS}d return vs prior ${MOMENTUM_WINDOW_DAYS}d · scale −10pp→0, +10pp→1`,
  };
}

const VOL_WINDOW = 20; // trailing sessions of daily returns
const VOL_MIN_POINTS = VOL_WINDOW + 1;
const VOL_FLOOR_PCT = 0.5; // →0, "Compressed"
const VOL_CEIL_PCT = 2.5; // →1, "Elevated"
/** Volatility — stdev of trailing daily % returns, fixed scale:
 *  0.5%/day → 0 (Compressed), 2.5%/day → 1 (Elevated). No inherent
 *  tailwind/headwind direction for gold, so bias is always 0. */
export function computeVolatility(history: GoldPricePoint[]): GoldIndicator | null {
  if (history.length < VOL_MIN_POINTS) return null;
  const window = history.slice(-VOL_MIN_POINTS);
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const pct = pctChange(window[i].value, window[i - 1].value);
    if (pct !== null) returns.push(pct);
  }
  if (returns.length < VOL_WINDOW) return null;
  const mean = returns.reduce((a, v) => a + v, 0) / returns.length;
  const variance = returns.reduce((a, v) => a + (v - mean) ** 2, 0) / returns.length;
  const stdev = Math.sqrt(variance);
  const normalized = clamp01((stdev - VOL_FLOOR_PCT) / (VOL_CEIL_PCT - VOL_FLOOR_PCT));
  const state = normalized > 0.66 ? "Elevated" : normalized < 0.33 ? "Compressed" : "Normal";
  return {
    state,
    score: round(normalized, 4),
    bias: 0,
    value: round(stdev, 3),
    note: `${VOL_WINDOW}-session stdev of daily %chg · scale ${VOL_FLOOR_PCT}%→0, ${VOL_CEIL_PCT}%→1`,
  };
}

function seriesFor(panel: MacroSeries[], key: string) {
  return panel.find((s) => s.key === key)?.observations ?? [];
}
function changeOverPanel(panel: MacroSeries[], key: string, days: number): number | null {
  const obs = seriesFor(panel, key);
  const latest = latestObs(obs);
  if (!latest) return null;
  const then = valueOnOrBefore(obs, daysBefore(latest.date, days));
  if (!then) return null;
  const pct = pctChange(latest.value, then.value);
  return pct === null ? null : round(pct, 2);
}

/** USD Pressure — reuses computeMacroPressure's exact dollar_broad
 *  formula (sources/fredMacro.ts's `dollar_broad`/DTWEXBGS, 6-month
 *  %chg, −5%→0, +5%→1): a strong dollar is a headwind for gold, same
 *  direction as for oil. High score = headwind building (bias −1);
 *  low score = tailwind easing (bias +1). */
export function computeUsdPressure(macroPanel: MacroSeries[]): GoldIndicator | null {
  const dollarChg = changeOverPanel(macroPanel, "dollar_broad", 182);
  if (dollarChg === null) return null;
  const normalized = clamp01((dollarChg + 5) / 10);
  const bias: -1 | 0 | 1 = normalized > 0.6 ? -1 : normalized < 0.4 ? 1 : 0;
  const state = bias === -1 ? "Building" : bias === 1 ? "Easing" : "Neutral";
  return {
    state,
    score: round(normalized, 4),
    bias,
    value: dollarChg,
    note: "Broad USD (DTWEXBGS) 6m %chg · −5%→0, +5%→1",
  };
}

const REAL_YIELD_FLOOR_PCT = -1.0; // →0, tailwind/easing
const REAL_YIELD_CEIL_PCT = 2.5; // →1, headwind/building
/** Real Yield Pressure — real 10y yield (DGS10 − T10YIE, both already
 *  in the FRED macro panel). Rising real yields raise the opportunity
 *  cost of holding non-yielding gold — a headwind. Fixed scale:
 *  −1.0% → 0 (easing), +2.5% → 1 (building). No existing leg computes
 *  this anywhere else in the codebase; new but same "fixed, legible
 *  scale" convention as every macro/engine.ts leg. */
export function computeRealYieldPressure(macroPanel: MacroSeries[]): GoldIndicator | null {
  const ratesObs = seriesFor(macroPanel, "rates_10y");
  const breakevenObs = seriesFor(macroPanel, "inflation_breakeven");
  const rates = latestObs(ratesObs);
  const breakeven = latestObs(breakevenObs);
  if (!rates || !breakeven) return null;
  const realYield = rates.value - breakeven.value;
  const normalized = clamp01((realYield - REAL_YIELD_FLOOR_PCT) / (REAL_YIELD_CEIL_PCT - REAL_YIELD_FLOOR_PCT));
  const bias: -1 | 0 | 1 = normalized > 0.6 ? -1 : normalized < 0.4 ? 1 : 0;
  const state = bias === -1 ? "Building" : bias === 1 ? "Easing" : "Neutral";
  return {
    state,
    score: round(normalized, 4),
    bias,
    value: round(realYield, 2),
    note: `10y real yield (DGS10 − T10YIE) · scale ${REAL_YIELD_FLOOR_PCT}%→0, ${REAL_YIELD_CEIL_PCT}%→1`,
  };
}

/** The full snapshot for a run day — pure, no IO. Callers (goldCycle)
 *  supply already-fetched history/macroPanel/live and this runDate. */
export function computeGoldSnapshot(
  history: GoldPricePoint[],
  macroPanel: MacroSeries[],
  live: GoldLiveTick | null,
  runDate: string,
): GoldEngineSnapshot {
  const { price, asOf } = resolveHeadlinePrice(history, live);
  return {
    runDate,
    price,
    priceAsOf: asOf,
    changes: computeGoldChanges(history, live),
    indicators: {
      trend: computeTrend(history),
      momentum: computeMomentum(history),
      volatility: computeVolatility(history),
      usdPressure: computeUsdPressure(macroPanel),
      realYieldPressure: computeRealYieldPressure(macroPanel),
    },
  };
}
