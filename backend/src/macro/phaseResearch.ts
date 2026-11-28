import { backtestPrice, summarizeBacktest, type BacktestResult, type PriceSeries } from "./allocationBacktest";
import { type AllocationInput, type Quadrant, type SleeveKey } from "./allocation";

export type PhaseBasis = "economic" | "market";
const phases: Quadrant[] = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"];
const assets: SleeveKey[] = ["stocks", "gold", "bitcoin"];
const compound = (returns: number[]) => returns.reduce((equity, r) => equity * (1 + r), 1) - 1;
const relative21 = (r: number, reference: number, days: number) => ((1 + r) / (1 + reference)) ** (21 / days) - 1;

/** Exploratory uncertainty across whole episodes, never treating each daily
 * observation as an independent macro event. Consecutive pairs of episodes
 * are resampled in circular blocks. This is not a significance test. */
export function episodeSummary(values: number[]) {
  const n = values.length;
  if (!n) return { n, mean: null, median: null, positiveShare: null, interval: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  let interval: [number, number] | null = null;
  if (n >= 8) {
    let seed = 16321;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const means: number[] = [];
    for (let b = 0; b < 1000; b++) {
      let sum = 0, count = 0;
      while (count < n) {
        const start = Math.floor(random() * n);
        for (let j = 0; j < 2 && count < n; j++, count++) sum += values[(start + j) % n];
      }
      means.push(sum / n);
    }
    means.sort((a, b) => a - b);
    interval = [means[24], means[974]];
  }
  return { n, mean, median, positiveShare: values.filter(v => v > 0).length / n, interval };
}

export function analyzeMacroPhases(inputs: AllocationInput[], prices: PriceSeries, base: BacktestResult,
  overlays: Record<string, BacktestResult>, basis: PhaseBasis, split: string) {
  const byDate = new Map(inputs.map(input => [input.date, input]));
  const groups: { phase: Quadrant | null; start: number; end: number }[] = [];
  base.steps.forEach((step, i) => {
    const input = byDate.get(step.date);
    if (!input) throw new Error(`No phase label for ${step.date}.`);
    const phase = basis === "economic" ? input.economicQuadrant : input.marketRegime;
    const last = groups.at(-1);
    if (!last || last.phase !== phase) groups.push({ phase, start: i, end: i + 1 });
    else last.end = i + 1;
  });
  for (const result of Object.values(overlays)) {
    if (result.steps.length !== base.steps.length || result.steps.some((s, i) => s.date !== base.steps[i].date || s.endDate !== base.steps[i].endDate))
      throw new Error("Phase comparisons require identical holding intervals.");
  }
  const episodes = groups.map((g, i) => {
    const steps = base.steps.slice(g.start, g.end), from = steps[0].date, to = steps.at(-1)!.endDate;
    const cashReturn = compound(steps.map(s => s.cashReturn));
    const baseReturn = compound(steps.map(s => s.periodReturn));
    const assetReturns = Object.fromEntries(assets.map(asset => {
      const a = backtestPrice(prices[asset], from, true), b = backtestPrice(prices[asset], to, true);
      const complete = steps.every(s => backtestPrice(prices[asset], s.date, true) !== null && backtestPrice(prices[asset], s.endDate, true) !== null);
      return [asset, a !== null && b !== null && complete ? b / a - 1 : null];
    })) as Record<SleeveKey, number | null>;
    const overlayReturns = Object.fromEntries(Object.entries(overlays).map(([key, result]) =>
      [key, compound(result.steps.slice(g.start, g.end).map(s => s.periodReturn))]));
    return { phase: g.phase, from, to, days: steps.length, complete: i > 0 && i < groups.length - 1,
      partition: to <= split ? "earlier" : from >= split ? "later" : "crosses-split",
      baseReturn, cashReturn, assetReturns, overlayReturns };
  });
  const summaries = phases.map(phase => {
    const all = episodes.filter(e => e.phase === phase), complete = all.filter(e => e.complete);
    const summary = (metric: (e: typeof episodes[number]) => number | null) => {
      const values = (es: typeof episodes) => es.map(metric).filter((v): v is number => v !== null);
      return { ...episodeSummary(values(complete)),
        earlier: episodeSummary(values(complete.filter(e => e.partition === "earlier"))),
        later: episodeSummary(values(complete.filter(e => e.partition === "later"))) };
    };
    return { phase, episodes: all.length, completeEpisodes: complete.length, days: all.reduce((s, e) => s + e.days, 0),
      assets: Object.fromEntries(assets.map(asset => [asset, summary(e => e.assetReturns[asset] === null ? null : relative21(e.assetReturns[asset]!, e.cashReturn, e.days))])),
      overlays: Object.fromEntries(Object.keys(overlays).map(key => [key, summary(e => relative21(e.overlayReturns[key], e.baseReturn, e.days))])) };
  });
  const periods = (result: BacktestResult) => ({
    earlier: summarizeBacktest(result.steps.filter(s => s.endDate <= split)),
    later: summarizeBacktest(result.steps.filter(s => s.date >= split)),
  });
  return { basis, episodes, summaries, baseMetrics: base.metrics, basePeriods: periods(base),
    overlayPeriods: Object.fromEntries(Object.entries(overlays).map(([key, result]) => [key, periods(result)])),
    overlayMetrics: Object.fromEntries(Object.entries(overlays).map(([key, result]) => [key, result.metrics])),
    method: "Contiguous phases use the label known at the holding period's start. First/last episodes are partial and excluded from inference. Means normalize relative wealth growth to 21 sessions and give each complete episode equal weight. Asset values compare adjusted buy-and-hold returns with cash, before entry/exit trading costs. Overlay values compare net returns with the same trend-only strategy, caps, signal, cadence, cash and costs. Intervals are exploratory 95% resampling ranges from 1,000 draws of paired consecutive whole episodes, shown only with at least eight complete episodes. Episodes may remain dependent; no multiple-testing correction or causal claim is made. Earlier/later comparisons omit episodes crossing the split. Revised macro data and reused validation periods cannot establish an out-of-sample positioning edge." };
}
export type PhaseResearch = ReturnType<typeof analyzeMacroPhases>;
