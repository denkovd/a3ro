/* Builds one research signal row from data known at `signalDate`. Pure, no IO:
 * the history script supplies the fetched panel and bars, tests supply fixtures.
 *
 * Kept out of backtestResearch.ts on purpose — that module is bundled into the
 * browser, and this one pulls in the macro engine. Only types cross the line. */
import type { MacroSeries } from "../sources/fredMacro";
import type { RegimeBar } from "../regime/types";
import { REGIME_UNIVERSE } from "../regime/universe";
import { computeMacroRegime, netLiquiditySeries } from "./engine";
import { computeSixCycles } from "./cycles";
import { computeRiskMatrix, computeVams, dailyLogVol } from "./vams";
import { SLEEVES, type Quadrant, type SleeveKey } from "./allocation";
import type { PricePoint } from "./allocationBacktest";
import { TREND_HORIZONS, type ResearchSignal } from "./backtestResearch";

/** Days after an observation's period-start date before the backtest may use it.
 * FRED dates an observation at the START of its period, so these cover the period
 * itself plus the publication delay. Approximations, not verified release dates. */
export const RELEASE_LAG_DAYS = { daily: 2, weekly: 8, monthly: 45, quarterly: 150 } as const;
/** BEA publishes fourth-quarter corporate profits with the THIRD GDP estimate in late
 * March (about 176–181 days after 1 October), a month later than the other quarters,
 * whose profits arrive with the second estimate (about 147–152 days). */
export const CORPORATE_PROFITS_Q4_LAG_DAYS = 180;
export const SIGNAL_SCHEMA = 2;

export function releaseLagDays(series: Pick<MacroSeries, "key" | "frequency">, observationDate: string): number {
  if (series.key === "corporate_profits" && observationDate.slice(5, 7) === "10") return CORPORATE_PROFITS_Q4_LAG_DAYS;
  return RELEASE_LAG_DAYS[series.frequency];
}
const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
/** The macro panel as it could have been known on `date`: every observation whose
 * release lag has elapsed. Does not repair revisions (FRED serves current vintages). */
export function laggedPanel(panel: MacroSeries[], date: string): MacroSeries[] {
  return panel.map(series => ({ ...series,
    observations: series.observations.filter(o => o.date <= daysBefore(date, releaseLagDays(series, o.date))) }));
}
const upTo = (bars: RegimeBar[], date: string) => bars.filter(b => b.date <= date);

export const EQUITY_VOL_WINDOW = 21, EQUITY_VOL_MEDIAN_WINDOW = 126;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** Annualised realised volatility over the last `EQUITY_VOL_WINDOW` sessions of `history`, and
 * the median of that measure across the last `EQUITY_VOL_MEDIAN_WINDOW` sessions (today's
 * reading included). Uses the same daily-log-return σ as the trend score. */
export function equityVolatility(history: RegimeBar[]): NonNullable<ResearchSignal["equityVol"]> {
  const annualised = (bars: RegimeBar[]) => { const vol = dailyLogVol(bars, EQUITY_VOL_WINDOW); return vol === null ? null : vol * Math.sqrt(252); };
  // 21 returns need 22 bars; 126 consecutive readings need 147. Nothing older is used.
  const recent = history.slice(-(EQUITY_VOL_WINDOW + EQUITY_VOL_MEDIAN_WINDOW));
  const realised21 = annualised(recent);
  const trailing: number[] = [];
  for (let back = 0; back < EQUITY_VOL_MEDIAN_WINDOW; back++) {
    const vol = annualised(recent.slice(0, recent.length - back));
    if (vol === null) break;
    trailing.push(vol);
  }
  let median126: number | null = null;
  if (trailing.length === EQUITY_VOL_MEDIAN_WINDOW) {
    const sorted = [...trailing].sort((a, b) => a - b), mid = sorted.length / 2;
    median126 = (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return { realised21: realised21 === null ? null : round6(realised21), median126: median126 === null ? null : round6(median126) };
}

export interface SignalInputs {
  /** Execution session and the prior session whose close the signal is formed on. */
  execution: string; signalDate: string;
  panel: MacroSeries[];
  /** Daily signal bars by Yahoo symbol: the regime universe plus HYG. */
  bars: Map<string, RegimeBar[]>;
  /** Portfolio return proxies, used only to mark a sleeve investable yet. */
  prices: Partial<Record<SleeveKey, PricePoint[]>>;
}

export function buildResearchSignal({ execution, signalDate, panel, bars, prices }: SignalInputs): ResearchSignal {
  if (signalDate >= execution) throw new Error("A signal must be formed before its execution date.");
  const asOfPanel = laggedPanel(panel, signalDate);
  const growth = asOfPanel.find(s => s.key === "growth_indpro")?.observations ?? [];
  const inflation = asOfPanel.find(s => s.key === "inflation_cpi")?.observations ?? [];
  const economic = computeMacroRegime(growth, inflation, signalDate);
  const reads = REGIME_UNIVERSE.map(e => computeVams(upTo(bars.get(e.symbol) ?? [], signalDate), e.symbol, e.displayName));
  const matrix = computeRiskMatrix(reads, signalDate);
  const cycles = computeSixCycles(asOfPanel, netLiquiditySeries(asOfPanel),
    upTo(bars.get("^GSPC") ?? [], signalDate), upTo(bars.get("HYG") ?? [], signalDate), signalDate);
  const states: ResearchSignal["states"] = {};
  const trendZ: NonNullable<ResearchSignal["trendZ"]> = {};
  const unavailable: SleeveKey[] = [];
  for (const sleeve of SLEEVES) {
    const history = upTo(bars.get(sleeve.symbol) ?? [], signalDate);
    const proxy = (prices[sleeve.key] ?? []).filter(b => b.date <= execution);
    if (history.length < 64 || !proxy.length) unavailable.push(sleeve.key);
    states[sleeve.key] = computeVams(history, sleeve.symbol, sleeve.label).state;
    // Research enrichment only: the allocation rule still reads `states` (63 observations).
    trendZ[sleeve.key] = Object.fromEntries(TREND_HORIZONS.map(window =>
      [String(window), computeVams(history, sleeve.symbol, sleeve.label, { window }).z]));
  }
  const voted = matrix.modalRegime !== "PENDING";
  const measured = reads.filter(read => read.z !== null), positive = measured.filter(read => read.z! > 0).length;
  return { date: execution, signalDate,
    marketRegime: voted ? matrix.modalRegime as Quadrant : null,
    economicQuadrant: economic.quadrant === "PENDING" ? null : economic.quadrant as Quadrant,
    states, headwinds: cycles.headwinds, unavailable,
    regimeShares: voted ? { ...matrix.shares } : null,
    marketsScored: matrix.scored, marketsAttempted: matrix.universe, trendZ,
    equityVol: equityVolatility(upTo(bars.get("^GSPC") ?? [], signalDate)),
    universeBreadth63: { positive, measured: measured.length, universe: reads.length,
      share: measured.length ? round6(positive / measured.length) : null } };
}
