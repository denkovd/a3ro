/* ────────────────────────────────────────────────────────────────
   Stock-split detection for stored bars (roadmap #104).

   The daily scan only re-fetches the last month. When a stock
   splits, Yahoo rescales its whole history, but only that month
   gets overwritten in market_bars, so older bars stay on the
   pre-split scale (MNST and APH showed this). The adapters store
   the split-adjusted, NOT dividend-adjusted close, so on dates both
   copies cover, stored and fresh closes should agree. When several
   of them disagree, stored history is on another scale and the
   symbol needs a full re-fetch.
──────────────────────────────────────────────────────────────── */

import { RegimeBar } from "../regime/types";

/** A close more than this far from the fresh one counts as a mismatch. */
export const RESCALE_TOLERANCE = 0.02;
/** Mismatching dates needed before re-fetching: one odd bar is a data blip, not a split. */
export const RESCALE_MIN_MISMATCHES = 2;

export interface RescaleCheck {
  rescaled: boolean;
  /** Dates both copies cover (excluding the newest stored bar). */
  compared: number;
  mismatches: number;
  /** Median stored/fresh close ratio over the mismatching dates, e.g. 2 after a 2-for-1 split. */
  ratio: number | null;
}

/**
 * Compares stored bars with freshly fetched ones on the dates both hold.
 * The newest stored bar is skipped: it may have been saved mid-session
 * and legitimately differ from the final close.
 */
export function detectRescale(
  stored: RegimeBar[],
  fresh: RegimeBar[],
  tolerance = RESCALE_TOLERANCE,
  minMismatches = RESCALE_MIN_MISMATCHES,
): RescaleCheck {
  if (stored.length === 0 || fresh.length === 0) return { rescaled: false, compared: 0, mismatches: 0, ratio: null };
  const newestStored = stored.reduce((m, b) => (b.date > m ? b.date : m), stored[0].date);
  const freshBy = new Map(fresh.map((b) => [b.date, b.close]));
  const ratios: number[] = [];
  let compared = 0;
  for (const b of stored) {
    if (b.date === newestStored) continue;
    const f = freshBy.get(b.date);
    if (f == null || !(f > 0) || !(b.close > 0)) continue;
    compared++;
    const r = b.close / f;
    if (Math.abs(r - 1) > tolerance) ratios.push(r);
  }
  const need = Math.min(minMismatches, compared);
  const rescaled = compared > 0 && ratios.length >= Math.max(need, 1);
  return { rescaled, compared, mismatches: ratios.length, ratio: ratios.length ? median(ratios) : null };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
