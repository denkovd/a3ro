/* ────────────────────────────────────────────────────────────────
   Shared pure date/series math — extracted from macro/engine.ts so
   gold/engine.ts (and any future domain reading a date-indexed
   observation series) can reuse the same lookup/percent-change
   primitives instead of re-deriving them. No IO, no domain knowledge.
──────────────────────────────────────────────────────────────── */

export interface DatedObservation {
  date: string; // "YYYY-MM-DD"
  value: number;
}

/** Newest observation, or null if the series is empty. Assumes obs is
 *  ascending by date. */
export function latestObs<T extends DatedObservation>(obs: T[]): T | null {
  return obs.length ? obs[obs.length - 1] : null;
}

/** ISO date `days` before `isoDate`. */
export function daysBefore(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Newest observation on or before `isoDate`. Assumes obs is ascending
 *  by date. Returns null if every observation is after `isoDate`. */
export function valueOnOrBefore<T extends DatedObservation>(
  obs: T[],
  isoDate: string,
): T | null {
  let found: T | null = null;
  for (const o of obs) {
    if (o.date <= isoDate) found = o;
    else break;
  }
  return found;
}

/** Percent change from `then` to `now`. Null when `then` is zero
 *  (undefined direction). */
export function pctChange(now: number, then: number): number | null {
  return then !== 0 ? ((now - then) / Math.abs(then)) * 100 : null;
}
