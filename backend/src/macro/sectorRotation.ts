/* ────────────────────────────────────────────────────────────────
   Sector rotation by US regime (roadmap #25).

   THE QUESTION: given the US regime the live page shows today, which
   S&P 500 sectors have tended to beat the market over the next month?
   That is a forward, relative question, so the statistic is

       excess(month) = sector return − SPY return, next ~30 days

   grouped by the regime label known at the start of the month.

   METHOD
   1. Labels: buildRegimeTimeline (affinityBacktest.ts), i.e. the live
      computeMacroRegime run on data truncated to each date, monthly.
      Because labels only use data available at the time, they lag the
      economy (regime_label_lag): this measures "what followed the
      regime we could see", which is the usable version.
   2. For each label date d and the next label date d', entry is the
      last close on or before d, exit the last close on or before d'.
      Sector ETFs and SPY both use adjusted (total-return) closes.
   3. Per sector and regime: months, mean monthly excess, share of
      months beating SPY, and a t-statistic for the mean.

   Leaders/laggards need MIN_MONTHS observations and |t| ≥ MIN_T; the
   rest are reported but marked weak. Same FRED-revision bias as the
   affinity backtest: labels use revised data, slightly better than a
   real-time observer had. Not a tradeable backtest.

   Pure, no IO — scripts/backtest-sector-rotation.ts feeds it.
──────────────────────────────────────────────────────────────── */
import type { RegimeBar } from "../regime/types";
import type { Quadrant, RegimeLabel } from "./affinityBacktest";

export const SECTORS = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLC", name: "Communication services" },
  { symbol: "XLY", name: "Consumer discretionary" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLRE", name: "Real estate" },
  { symbol: "XLV", name: "Health care" },
  { symbol: "XLP", name: "Consumer staples" },
  { symbol: "XLU", name: "Utilities" },
] as const;
export const BENCHMARK = "SPY";
export const QUADRANTS: Quadrant[] = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"];

/** Months a sector needs in a regime before it can be called a leader or laggard. */
export const MIN_MONTHS = 12;
/** |t| a mean excess must clear to count; below it the result is reported as weak. */
export const MIN_T = 1.5;

export interface SectorRegimeStat {
  symbol: string; quadrant: Quadrant; months: number;
  /** Mean monthly return minus SPY, as a fraction. */
  meanExcess: number | null;
  /** Share of months the sector beat SPY. */
  beatShare: number | null;
  t: number | null;
  verdict: "leads" | "lags" | "weak";
}

/** Last close on or before `date`, by binary search over oldest-first bars. */
export function closeOnOrBefore(bars: readonly RegimeBar[], date: string): number | null {
  let lo = 0, hi = bars.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= date) { hit = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return hit < 0 ? null : bars[hit].close;
}

/** Excess return per label month: [label, sector − SPY] for months both series cover. */
export function monthlyExcess(sector: readonly RegimeBar[], bench: readonly RegimeBar[], timeline: readonly RegimeLabel[]): { quadrant: Quadrant; excess: number }[] {
  const out: { quadrant: Quadrant; excess: number }[] = [];
  if (!sector.length || !bench.length) return out;
  const firstSector = sector[0].date, lastBar = sector[sector.length - 1].date < bench[bench.length - 1].date ? sector[sector.length - 1].date : bench[bench.length - 1].date;
  for (let k = 0; k + 1 < timeline.length; k++) {
    const d = timeline[k].date, next = timeline[k + 1].date;
    if (d < firstSector || next > lastBar) continue;
    const s0 = closeOnOrBefore(sector, d), s1 = closeOnOrBefore(sector, next);
    const b0 = closeOnOrBefore(bench, d), b1 = closeOnOrBefore(bench, next);
    if (!s0 || !s1 || !b0 || !b1) continue;
    out.push({ quadrant: timeline[k].quadrant, excess: (s1 / s0 - 1) - (b1 / b0 - 1) });
  }
  return out;
}

export function summarise(symbol: string, quadrant: Quadrant, xs: readonly number[]): SectorRegimeStat {
  const n = xs.length;
  if (n === 0) return { symbol, quadrant, months: 0, meanExcess: null, beatShare: null, t: null, verdict: "weak" };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const t = sd > 0 ? mean / (sd / Math.sqrt(n)) : null;
  const strong = n >= MIN_MONTHS && t !== null && Math.abs(t) >= MIN_T;
  return {
    symbol, quadrant, months: n, meanExcess: mean, beatShare: xs.filter((x) => x > 0).length / n, t,
    verdict: strong ? (mean > 0 ? "leads" : "lags") : "weak",
  };
}

/** Every sector × regime cell. */
export function sectorRotation(
  bars: ReadonlyMap<string, readonly RegimeBar[]>,
  timeline: readonly RegimeLabel[],
): SectorRegimeStat[] {
  const bench = bars.get(BENCHMARK) ?? [];
  const out: SectorRegimeStat[] = [];
  for (const { symbol } of SECTORS) {
    const months = monthlyExcess(bars.get(symbol) ?? [], bench, timeline);
    for (const q of QUADRANTS) out.push(summarise(symbol, q, months.filter((m) => m.quadrant === q).map((m) => m.excess)));
  }
  return out;
}

const r = (x: number | null, d: number) => (x === null ? "null" : Number(x.toFixed(d)).toString());

/** The generated TypeScript module, with the run's provenance in its header. */
export function renderSectorRotationModule(stats: readonly SectorRegimeStat[], meta: { generatedAt: string; from: string; to: string; labels: number; source: string }): string {
  const rows = stats.map((s) =>
    `  { symbol: ${JSON.stringify(s.symbol)}, quadrant: ${JSON.stringify(s.quadrant)}, months: ${s.months}, meanExcess: ${r(s.meanExcess, 5)}, beatShare: ${r(s.beatShare, 3)}, t: ${r(s.t, 2)}, verdict: ${JSON.stringify(s.verdict)} },`);
  return `/* GENERATED by scripts/backtest-sector-rotation.ts on ${meta.generatedAt}. Do not edit by hand.
   Regime labels ${meta.from} → ${meta.to} (${meta.labels} months), live GRID engine on truncated data.
   Bars: ${meta.source}. Excess = next-month sector return − SPY (adjusted closes).
   Leader/laggard needs ≥ ${MIN_MONTHS} months and |t| ≥ ${MIN_T}; otherwise "weak". Not a tradeable backtest. */
import type { SectorRegimeStat } from "./sectorRotation";

export const SECTOR_ROTATION_META = ${JSON.stringify(meta)} as const;

export const SECTOR_ROTATION: readonly SectorRegimeStat[] = [
${rows.join("\n")}
];
`;
}
