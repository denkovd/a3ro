/* ────────────────────────────────────────────────────────────────
   BTC engine — pure, deterministic, no IO (same posture as
   gold/engine.ts). Deliberately smaller scope: price + d1/w1/m1/y1
   changes only. No indicator block (Trend/Momentum/Volatility/…) this
   phase — that's Gold-specific plumbing tied to gold's macro drivers
   (real yields, dollar strength), not something to copy verbatim for
   BTC; a BTC indicator set is future scope, not part of "price + ETF
   flows only".
──────────────────────────────────────────────────────────────── */

import { daysBefore, latestObs, pctChange, valueOnOrBefore } from "../core/seriesMath";

export interface BtcPricePoint {
  date: string; // "YYYY-MM-DD"
  value: number;
}

export interface BtcLiveTick {
  price: number;
  asOf: string; // ISO-8601 UTC
}

export interface BtcChanges {
  d1: number | null;
  w1: number | null;
  m1: number | null;
  y1: number | null;
}

export interface BtcEngineSnapshot {
  runDate: string;
  price: number | null;
  priceAsOf: string | null;
  changes: BtcChanges;
}

function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

function changeOverHistory(history: BtcPricePoint[], days: number): number | null {
  const latest = latestObs(history);
  if (!latest) return null;
  const then = valueOnOrBefore(history, daysBefore(latest.date, days));
  if (!then) return null;
  const pct = pctChange(latest.value, then.value);
  return pct === null ? null : round(pct, 2);
}

/** Every leg reads the daily-close history only. Unlike GoldAPI's
 *  `chp`, Coinbase's spot tick carries no day-change field of its own,
 *  so there is nothing to blend for d1 either — all four changes are
 *  derived the same way, straight off settlement closes. */
export function computeBtcChanges(history: BtcPricePoint[]): BtcChanges {
  return {
    d1: changeOverHistory(history, 1),
    w1: changeOverHistory(history, 7),
    m1: changeOverHistory(history, 30),
    y1: changeOverHistory(history, 365),
  };
}

/** Live tick wins when present (freshest); else the newest daily close,
 *  with a nominal asOf for that date. */
export function resolveHeadlinePrice(
  history: BtcPricePoint[],
  live: BtcLiveTick | null,
): { price: number | null; asOf: string | null } {
  if (live) return { price: live.price, asOf: live.asOf };
  const latest = latestObs(history);
  return latest ? { price: latest.value, asOf: `${latest.date}T00:00:00Z` } : { price: null, asOf: null };
}

export function computeBtcSnapshot(
  history: BtcPricePoint[],
  live: BtcLiveTick | null,
  runDate: string,
): BtcEngineSnapshot {
  const { price, asOf } = resolveHeadlinePrice(history, live);
  return {
    runDate,
    price,
    priceAsOf: asOf,
    changes: computeBtcChanges(history),
  };
}
