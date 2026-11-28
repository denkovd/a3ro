import { SLEEVES, type SleeveKey } from "./allocation";
import { computeVams } from "./vams";
import { VAMS_21_WINDOW, VAMS_21_THRESHOLD, type DailyVamsSignal } from "./vams21Backtest";
import type { PricePoint } from "./allocationBacktest";
import type { RegimeBar } from "../regime/types";

/** Inputs include warm-up history. Signals use each asset's own daily bars
 * strictly before execution, including weekend crypto bars. */
export function buildDailyVams21(bars: Partial<Record<SleeveKey, RegimeBar[]>>, calendar: PricePoint[]): DailyVamsSignal[] {
  return buildDailyVams(bars, calendar, VAMS_21_WINDOW);
}

/** Same construction for any trend window (the regime lab also uses 63 daily observations). */
export function buildDailyVams(bars: Partial<Record<SleeveKey, RegimeBar[]>>, calendar: PricePoint[], window: 21 | 63): DailyVamsSignal[] {
  const cursors: Record<SleeveKey, number> = { stocks: 0, gold: 0, bitcoin: 0 };
  return calendar.map(execution => {
    const states: DailyVamsSignal["states"] = {}, unavailable: SleeveKey[] = [];
    let signalDate = "";
    for (const sleeve of SLEEVES) {
      const history = bars[sleeve.key] ?? [];
      let cursor = cursors[sleeve.key];
      while (cursor < history.length && history[cursor].date < execution.date) cursor++;
      cursors[sleeve.key] = cursor;
      const asOf = history[cursor - 1]?.date;
      if (asOf && asOf > signalDate) signalDate = asOf;
      const state = computeVams(history.slice(Math.max(0, cursor - window - 1), cursor), sleeve.symbol, sleeve.label,
        { window, threshold: VAMS_21_THRESHOLD }).state;
      states[sleeve.key] = state;
      if (cursor < window + 1 || !asOf || Date.parse(execution.date) - Date.parse(asOf) > 7 * 86400000 || state === "PENDING") unavailable.push(sleeve.key);
    }
    return { date: execution.date, signalDate, states, unavailable };
  });
}
