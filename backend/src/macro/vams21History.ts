import { SLEEVES, type SleeveKey } from "./allocation";
import { computeVams } from "./vams";
import { VAMS_21_WINDOW, VAMS_21_THRESHOLD, type DailyVamsSignal } from "./vams21Backtest";
import type { PricePoint } from "./allocationBacktest";
import type { RegimeBar } from "../regime/types";

/** Inputs include warm-up history. Signals use each asset's own daily bars
 * strictly before execution, including weekend crypto bars. */
export function buildDailyVams21(bars: Partial<Record<SleeveKey, RegimeBar[]>>, calendar: PricePoint[]): DailyVamsSignal[] {
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
      const state = computeVams(history.slice(Math.max(0, cursor - VAMS_21_WINDOW - 1), cursor), sleeve.symbol, sleeve.label,
        { window: VAMS_21_WINDOW, threshold: VAMS_21_THRESHOLD }).state;
      states[sleeve.key] = state;
      if (cursor < VAMS_21_WINDOW + 1 || !asOf || Date.parse(execution.date) - Date.parse(asOf) > 7 * 86400000 || state === "PENDING") unavailable.push(sleeve.key);
    }
    return { date: execution.date, signalDate, states, unavailable };
  });
}
