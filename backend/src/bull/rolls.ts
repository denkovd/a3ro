/* ────────────────────────────────────────────────────────────────
   Continuous-futures back-adjustment — CL=F, GC=F.

   Yahoo's continuous futures are SPLICED, not back-adjusted: every
   contract roll leaves an artificial gap that can nudge Donchian
   flip lines. This module detects rolls and maintains an adjusted
   series alongside the raw one.

   Roll detection — no hardcoded schedules:
   The scan fetches the nearest dated contracts (month codes
   generated programmatically) alongside the continuous symbol and
   matches the continuous close against each contract's close per
   date. A roll is the day the match switches contracts. The gap is
   measured between two REAL contract closes on that day — a genuine
   gap-open can never be mistaken for a roll, because we never infer
   from the continuous series alone.

   Adjustment — additive back-shift:
   All bars strictly BEFORE the roll date shift by +gap; gaps
   accumulate across rolls. The latest bar is never touched — the
   present is always the real traded price. Raw bars are never
   mutated; only the 'adj' series shifts.

   Honest limitation (documented in docs/bull-market-finder.md):
   Yahoo drops expired-contract history, so rolls BEFORE pipeline
   launch cannot be reconstructed. Adjustment accumulates
   prospectively from go-live; pre-launch history stays raw-spliced.

   Everything here is pure — no clock, no IO. The pipeline wires it
   to fetch/storage with per-symbol isolation: a roll failure on
   gold flags that symbol and never blocks BTC-USD or ^GSPC.
──────────────────────────────────────────────────────────────── */

import { RegimeBar } from "../regime/types";
import { RollEvent, RollProbeResult } from "./types";

/** CME month codes, Jan → Dec. */
export const MONTH_CODES = "FGHJKMNQUVXZ";

/**
 * The next `count` dated-contract symbols for a root, starting from
 * the contract month containing/after `asOf`. Only months in
 * `activeMonths` are emitted (GC trades Feb/Apr/Jun/Aug/Oct/Dec).
 * E.g. ("CL", ".NYM", "FGHJKMNQUVXZ", "2026-07-10", 3)
 *   → ["CLQ26.NYM", "CLU26.NYM", "CLV26.NYM"]
 * (front month for a mid-July date is August: CL's July contract
 * stopped trading in late June — starting at month+1 and scanning
 * forward covers every root without per-root expiry rules; the
 * close-matching step below decides which candidate is ACTUALLY
 * front, so over-generation is harmless.)
 */
export function contractSymbols(
  root: string,
  suffix: string,
  activeMonths: string,
  asOf: string,
  count: number,
): string[] {
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7)); // 1-12
  const out: string[] = [];
  // Scan up to 26 months ahead; emit contracts whose month code is active.
  for (let k = 1; out.length < count && k <= 26; k++) {
    const m = ((month - 1 + k) % 12) + 1;
    const y = year + Math.floor((month - 1 + k) / 12);
    const code = MONTH_CODES[m - 1];
    if (!activeMonths.includes(code)) continue;
    out.push(`${root}${code}${String(y).slice(2)}${suffix}`);
  }
  return out;
}

/** Relative tolerance for "continuous close == contract close".
 *  Same-instrument closes from the same venue agree to the tick;
 *  0.05% absorbs rounding without ever matching the wrong month
 *  (adjacent CL months differ by ~0.5–2%). */
export const MATCH_TOLERANCE = 0.0005;

export function closesMatch(a: number, b: number, tol = MATCH_TOLERANCE): boolean {
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) <= tol;
}

/**
 * Which candidate contract the continuous series tracked on each of
 * its recent dates. Returns date → contract symbol (dates where no
 * candidate matches are omitted — e.g. bars from before the oldest
 * candidate was front).
 */
export function matchContinuousToContracts(
  continuous: RegimeBar[],
  contracts: Map<string, RegimeBar[]>,
): Map<string, string> {
  const closeBySymbolDate = new Map<string, Map<string, number>>();
  for (const [sym, bars] of contracts) {
    closeBySymbolDate.set(sym, new Map(bars.map((b) => [b.date, b.close])));
  }
  const out = new Map<string, string>();
  for (const bar of continuous) {
    for (const [sym, byDate] of closeBySymbolDate) {
      const c = byDate.get(bar.date);
      if (c !== undefined && closesMatch(bar.close, c)) {
        out.set(bar.date, sym);
        break; // first (nearest-month) match wins
      }
    }
  }
  return out;
}

/**
 * Detect a roll inside the matched window: the first date pair where
 * the tracked contract switches. Gap = newFrontClose − oldFrontClose
 * on the ROLL DATE (both contracts trade that day).
 * Returns null when no switch occurred or the gap isn't computable
 * (missing bar on either leg — better no adjustment than a wrong one).
 */
export function detectRoll(
  symbol: string,
  continuous: RegimeBar[],
  contracts: Map<string, RegimeBar[]>,
  priorCumAdjustment: number,
): RollEvent | null {
  const tracked = matchContinuousToContracts(continuous, contracts);
  const dates = continuous.map((b) => b.date).filter((d) => tracked.has(d));
  for (let i = 1; i < dates.length; i++) {
    const prevSym = tracked.get(dates[i - 1])!;
    const currSym = tracked.get(dates[i])!;
    if (prevSym === currSym) continue;

    const rollDate = dates[i];
    const oldBars = contracts.get(prevSym);
    const newBars = contracts.get(currSym);
    const oldClose = oldBars?.find((b) => b.date === rollDate)?.close;
    const newClose = newBars?.find((b) => b.date === rollDate)?.close;
    if (oldClose === undefined || newClose === undefined) return null;

    const gap = newClose - oldClose;
    return {
      symbol,
      rollDate,
      oldContract: prevSym,
      newContract: currSym,
      gap,
      cumAdjustment: priorCumAdjustment + gap,
    };
  }
  return null;
}

/** Pure back-shift: bars strictly before rollDate move by +gap.
 *  (The DB equivalent is bullRepo.shiftAdjBarsBefore.) */
export function applyBackAdjustment(bars: RegimeBar[], roll: RollEvent): RegimeBar[] {
  return bars.map((b) =>
    b.date < roll.rollDate
      ? { date: b.date, open: b.open + roll.gap, high: b.high + roll.gap,
          low: b.low + roll.gap, close: b.close + roll.gap }
      : b,
  );
}

/**
 * Verification probe — confirms adjustments were applied correctly.
 * At a check date, adj − raw must equal the sum of gaps of every
 * roll AFTER that date (rolls shift only prior history). Also
 * asserts the latest bar is untouched (present = real traded price).
 */
export function verifyAdjustment(
  raw: RegimeBar[],
  adj: RegimeBar[],
  rolls: RollEvent[],
  checkDate: string,
): RollProbeResult {
  const rawBar = raw.find((b) => b.date === checkDate);
  const adjBar = adj.find((b) => b.date === checkDate);
  if (!rawBar || !adjBar) {
    return {
      ok: false, checkedDate: checkDate,
      rawClose: rawBar?.close ?? NaN, adjClose: adjBar?.close ?? NaN,
      expectedDelta: NaN, actualDelta: NaN,
      detail: `check date ${checkDate} missing from ${!rawBar ? "raw" : "adj"} series`,
    };
  }
  const expectedDelta = rolls
    .filter((r) => r.rollDate > checkDate)
    .reduce((sum, r) => sum + r.gap, 0);
  const actualDelta = adjBar.close - rawBar.close;
  const deltaOk = Math.abs(actualDelta - expectedDelta) < 1e-6;

  const rawLast = raw[raw.length - 1];
  const adjLast = adj[adj.length - 1];
  const presentOk =
    !!rawLast && !!adjLast && rawLast.date === adjLast.date &&
    Math.abs(rawLast.close - adjLast.close) < 1e-9;

  return {
    ok: deltaOk && presentOk,
    checkedDate: checkDate,
    rawClose: rawBar.close,
    adjClose: adjBar.close,
    expectedDelta,
    actualDelta,
    detail: !deltaOk
      ? `delta mismatch: adj−raw=${actualDelta}, expected ${expectedDelta}`
      : !presentOk
        ? "latest bar differs between raw and adj — the present must never be adjusted"
        : "ok",
  };
}
