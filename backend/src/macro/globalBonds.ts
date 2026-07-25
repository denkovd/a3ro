/* ────────────────────────────────────────────────────────────────
   Global government bond stress — the live stand-in for Dale's
   "global IG government bond yield surged to 3.68%, steepest monthly
   loss since March" (docs/regime-macro-refresh.md §1.1).

   There is no free daily feed for a global IG sovereign yield
   aggregate, and FRED's OECD international 10y series lag ~4 months
   (probed 2026-07-25 — Japan last updated 15 Apr with March data), so
   they cannot back a leading-indicator claim. What IS observable daily
   and for free is the PRICE of the same exposure: an international
   government bond ETF. Yields up ⇒ price down, so a falling 1-month
   return is the stress read, in the same direction and roughly the
   same magnitude ordering as the yield move.

   Reuses the regime scanner's Yahoo daily-history fetcher rather than
   adding a second HTTP path. Candidates are tried in order and the
   FIRST that returns usable bars wins — a fallback chain, not an
   average, so the read always traces to one named instrument.

   Caveats, stated because the UI surfaces them:
   - USD-unhedged, so part of the move is FX, not yield. Accepted: the
     dollar leg is scored separately and a global-savings-scarcity
     episode tends to show in both.
   - ETF total return ≠ index yield. We report the return, never a
     reconstructed yield.
──────────────────────────────────────────────────────────────── */

import { fetchDailyHistory } from "../regime/yahooHistory";
import { RegimeBar } from "../regime/types";

/** Fallback chain, best-first. BWX is the broadest ex-US sovereign
 *  book; IGOV is the near-identical iShares alternative; BNDX is
 *  hedged and broader (govt + corp) — last resort. */
export const GLOBAL_BOND_SYMBOLS = [
  { symbol: "BWX", label: "Intl Treasury (BWX)" },
  { symbol: "IGOV", label: "Intl Treasury (IGOV)" },
  { symbol: "BNDX", label: "Global ex-US Bond (BNDX)" },
] as const;

export interface GlobalBondRead {
  symbol: string;
  label: string;
  asOf: string;
  /** % return over ~21 sessions — the "monthly loss" read. */
  return1m: number | null;
  /** % return over ~63 sessions. */
  return3m: number | null;
  /** % below the trailing 1-year closing high (≤ 0). */
  drawdown1y: number | null;
}

/** Close `sessions` bars back, or null when history is too short. */
function closeBack(bars: RegimeBar[], sessions: number): number | null {
  const i = bars.length - 1 - sessions;
  return i >= 0 ? bars[i].close : null;
}

function pct(now: number, then: number | null): number | null {
  if (then === null || then === 0) return null;
  return Math.round(((now - then) / Math.abs(then)) * 10_000) / 100;
}

/** Pure: bars → the three reads. Exported for fixture tests. */
export function readGlobalBonds(
  bars: RegimeBar[],
  symbol: string,
  label: string,
): GlobalBondRead | null {
  if (bars.length < 22) return null; // a 1m return is the minimum useful output
  const last = bars[bars.length - 1];
  const window = bars.slice(-252);
  const high = window.reduce((m, b) => (b.close > m ? b.close : m), window[0].close);

  return {
    symbol,
    label,
    asOf: last.date,
    return1m: pct(last.close, closeBack(bars, 21)),
    return3m: pct(last.close, closeBack(bars, 63)),
    drawdown1y: high > 0 ? Math.round(((last.close - high) / high) * 10_000) / 100 : null,
  };
}

/**
 * First candidate that yields usable bars. Never throws: a Yahoo
 * outage degrades this one leg to null and the liquidity composite
 * re-weights over whatever else is live — same posture as every other
 * leg in the macro cycle.
 */
export async function fetchGlobalBondStress(
  opts: { fetchImpl?: (symbol: string) => Promise<RegimeBar[]> } = {},
): Promise<GlobalBondRead | null> {
  const fetchOne = opts.fetchImpl ?? fetchDailyHistory;
  for (const { symbol, label } of GLOBAL_BOND_SYMBOLS) {
    try {
      const read = readGlobalBonds(await fetchOne(symbol), symbol, label);
      if (read) return read;
    } catch {
      // try the next candidate — a dead ticker or a throttled request
      // must not take the whole macro cycle down
    }
  }
  return null;
}
