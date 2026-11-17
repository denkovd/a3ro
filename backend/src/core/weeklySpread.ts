/* ────────────────────────────────────────────────────────────────
   Weekly spread — how much a gate's 7-day average normally moves.
   Pure, deterministic, no IO: plain functions over daily values, so
   the adapter (sources/portwatchWeekly.ts) is the only part that
   talks to PortWatch and every number here is fixture-testable.

   WHY THIS EXISTS: corridor_baselines carries mean/p10/p90 of DAILY
   values. The live reading the product shows is a 7-DAY AVERAGE
   (tanker_transits_7d / tanker_volume_7d), which is far steadier
   than a single day, so the daily p10–p90 band is the wrong yardstick
   for it. This module describes the 7-day average itself, per gate
   and per baseline window.

   WHAT A "WEEK" IS: a trailing window of 7 calendar days ending on a
   reported day, kept only when at least WEEK_MIN_REPORTED_DAYS of
   those days were reported. One window per reported day, so windows
   overlap — the quantiles describe "the 7-day average on any given
   day", which is exactly what the live reading is.

   TWO MEASURES, DELIBERATELY DIFFERENT:
     • quantiles (min…max) — where a reading ranks among the window's
       7-day averages. Honest but NOT robust: a long outage becomes
       part of the distribution (after six months shut, a shut gate
       sits inside the 5-year p10).
     • mad — median absolute deviation of the 7-day averages around
       their median. Robust: unaffected until an outage covers half
       the window, so it keeps describing normal week-to-week movement
       through a disruption. Consumers size the "typical range" from
       this, never from the quantiles.
──────────────────────────────────────────────────────────────── */

import { WeeklySpread } from "./corridorTypes";

export interface DailyValue {
  date: string; // YYYY-MM-DD
  value: number;
}

export const WEEK_DAYS = 7;
/** A trailing week with fewer reported days than this is not averaged. */
export const WEEK_MIN_REPORTED_DAYS = 5;
/** Fewer 7-day windows than this in a baseline window ⇒ no spread row. */
export const SPREAD_MIN_WINDOWS = 30;

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / DAY_MS);
}

/** Linear-interpolated quantile of an ASCENDING array (same convention
 *  as SQL percentile_cont, which the daily baselines use). */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * Trailing 7-calendar-day means, one per reported day in [from, to].
 * `points` may (and should) start a week before `from` so the first
 * windows are complete. Unordered and duplicate dates are tolerated
 * (last value for a date wins); non-finite values are dropped.
 */
export function trailingWeekMeans(points: DailyValue[], from: string, to: string): number[] {
  const byDate = new Map<string, number>();
  for (const p of points) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value)) byDate.set(p.date, p.value);
  }
  const days = [...byDate.entries()]
    .map(([date, value]) => ({ date, value, n: dayNumber(date) }))
    .sort((a, b) => a.n - b.n);

  const means: number[] = [];
  let start = 0;
  let sum = 0;
  for (let i = 0; i < days.length; i++) {
    sum += days[i].value;
    while (days[start].n < days[i].n - (WEEK_DAYS - 1)) {
      sum -= days[start].value;
      start++;
    }
    const reported = i - start + 1;
    if (days[i].date < from || days[i].date > to) continue;
    if (reported < WEEK_MIN_REPORTED_DAYS) continue;
    means.push(sum / reported);
  }
  return means;
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

/**
 * Spread of the 7-day averages inside [from, to], or null when the
 * window holds fewer than SPREAD_MIN_WINDOWS usable weeks (a gate with
 * a thin record gets no spread rather than a noisy one).
 */
export function weeklySpread(points: DailyValue[], from: string, to: string): WeeklySpread | null {
  const means = trailingWeekMeans(points, from, to).sort((a, b) => a - b);
  if (means.length < SPREAD_MIN_WINDOWS) return null;
  const median = quantile(means, 0.5);
  const deviations = means.map((m) => Math.abs(m - median)).sort((a, b) => a - b);
  return {
    n: means.length,
    min: round4(means[0]),
    p05: round4(quantile(means, 0.05)),
    p10: round4(quantile(means, 0.1)),
    p25: round4(quantile(means, 0.25)),
    p50: round4(median),
    p75: round4(quantile(means, 0.75)),
    p90: round4(quantile(means, 0.9)),
    p95: round4(quantile(means, 0.95)),
    max: round4(means[means.length - 1]),
    mad: round4(quantile(deviations, 0.5)),
    sampleFrom: from,
    sampleTo: to,
  };
}

const SPREAD_NUMERIC_KEYS = ["n", "min", "p05", "p10", "p25", "p50", "p75", "p90", "p95", "max", "mad"] as const;

/** Validate a stored/transported spread. Anything malformed reads as
 *  null — a consumer then falls back to its fixed band rather than
 *  trusting half a distribution. */
export function parseWeeklySpread(raw: unknown): WeeklySpread | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  for (const k of SPREAD_NUMERIC_KEYS) {
    if (typeof o[k] !== "number" || !Number.isFinite(o[k])) return null;
  }
  if (typeof o.sampleFrom !== "string" || typeof o.sampleTo !== "string") return null;
  return {
    n: o.n as number,
    min: o.min as number,
    p05: o.p05 as number,
    p10: o.p10 as number,
    p25: o.p25 as number,
    p50: o.p50 as number,
    p75: o.p75 as number,
    p90: o.p90 as number,
    p95: o.p95 as number,
    max: o.max as number,
    mad: o.mad as number,
    sampleFrom: o.sampleFrom,
    sampleTo: o.sampleTo,
  };
}
