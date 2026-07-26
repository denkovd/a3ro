/* ────────────────────────────────────────────────────────────────
   Bagholder Risk Map — market-context assembler. The only IO in the
   bagholder scoring path (mirrors thesis/marketContext.ts): pulls
   whatever live reads exist for a narrative's implicated assets
   (macro regime, positioning indicators, relative performance vs a
   benchmark) and hands the pure engine a BagholderContext where every
   missing feed is an honest null/empty array — the engine then emits
   a "no_data" contribution, never an invented number.

   Each read is individually isolated: one failed store nulls only
   its own field.
──────────────────────────────────────────────────────────────── */

import { Queryable } from "../storage/db";
import { getLatestMacroSnapshot } from "../storage/macroRepo";
import { getLatestPositioningForSymbols } from "../storage/bagholderRepo";
import { AssetPerformanceRead, AssetPositioningRead, BagholderContext, NarrativeAssetLink } from "./types";

const LOOKBACK_DAYS = 220;
const RETURN_WINDOW_SESSIONS = 21;   // ~1 trading month, matches the swing-timeframe design point
const VOL_WINDOW_SESSIONS = 60;

async function barSeries(db: Queryable, symbol: string, fromDate: string): Promise<{ date: string; close: number }[]> {
  const res = await db.query(
    `select date, close from market_bars
      where symbol = $1 and series = 'adj' and date >= $2
      order by date asc`,
    [symbol, fromDate],
  );
  return res.rows.map((r) => ({
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
    close: Number(r.close),
  }));
}

function trailingReturn(series: { close: number }[], windowSessions: number): number | null {
  if (series.length < windowSessions + 1) return null;
  const start = series[series.length - 1 - windowSessions].close;
  const end = series[series.length - 1].close;
  if (start <= 0) return null;
  return end / start - 1;
}

function realizedDailySigma(series: { close: number }[], windowSessions: number): number | null {
  const pts = series.filter((p) => p.close > 0);
  if (pts.length < 21) return null;
  const window = pts.slice(-Math.min(windowSessions + 1, pts.length));
  const rets: number[] = [];
  for (let i = 1; i < window.length; i++) rets.push(Math.log(window[i].close / window[i - 1].close));
  if (rets.length < 20) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varSum = rets.reduce((a, r) => a + (r - mean) ** 2, 0);
  return Math.sqrt(varSum / (rets.length - 1));
}

/** Assemble everything the L1/L3/L4 layers may read for one narrative.
 *  `implicated` excludes BENCHMARK-role links — those feed only the
 *  relative-performance baseline, not their own positioning/opportunity read. */
export async function assembleBagholderContext(
  db: Queryable,
  implicated: NarrativeAssetLink[],
  benchmarkSymbol: string,
): Promise<BagholderContext> {
  const asOf = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const symbols = implicated.filter((l) => l.exposureType !== "BENCHMARK").map((l) => l.symbol);

  let macro: BagholderContext["macro"] = null;
  try {
    const m = await getLatestMacroSnapshot(db);
    if (m && m.quadrant !== "PENDING") {
      macro = {
        quadrant: m.quadrant,
        pressureScore: m.pressureScore,
        growthMomentum: m.growthMomentum,
        inflationMomentum: m.inflationMomentum,
        runDate: m.runDate,
      };
    }
  } catch { /* isolated */ }

  let positioning: AssetPositioningRead[] = [];
  try {
    const rows = await getLatestPositioningForSymbols(db, symbols);
    positioning = rows.map((r) => ({
      symbol: r.symbol,
      indicatorType: r.indicatorType,
      value: r.value,
      percentile1y: r.percentile1y,
      stance: r.stance,
      reportDate: r.reportDate,
    }));
  } catch { /* isolated */ }

  let benchmarkSeries: { date: string; close: number }[] = [];
  try {
    benchmarkSeries = await barSeries(db, benchmarkSymbol, fromDate);
  } catch { /* isolated */ }
  const benchmarkReturn = trailingReturn(benchmarkSeries, RETURN_WINDOW_SESSIONS);

  const performance: AssetPerformanceRead[] = [];
  for (const symbol of symbols) {
    try {
      const series = await barSeries(db, symbol, fromDate);
      const symbolReturn = trailingReturn(series, RETURN_WINDOW_SESSIONS);
      const rsVsBenchmark = symbolReturn !== null && benchmarkReturn !== null ? symbolReturn - benchmarkReturn : null;
      performance.push({
        symbol,
        closeSeries: series,
        rsVsBenchmark,
        realizedDailySigma: realizedDailySigma(series, VOL_WINDOW_SESSIONS),
      });
    } catch {
      performance.push({ symbol, closeSeries: [], rsVsBenchmark: null, realizedDailySigma: null });
    }
  }

  return { asOf, macro, positioning, performance, benchmarkSymbol };
}
