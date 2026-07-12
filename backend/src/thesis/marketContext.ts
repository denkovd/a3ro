/* ────────────────────────────────────────────────────────────────
   Market-context assembler — the ONLY IO in the thesis domain's
   analysis path. Pulls whatever live reads exist for an instrument
   (price, return series, tape, macro, COT, Money Line trend) and
   hands the pure engines a MarketContext where every missing feed is
   an honest null (the engines then emit "no_data" checks, never
   invented numbers).

   Each read is individually isolated: one failed store can only null
   its own field. The assembler never throws for a missing feed —
   only for a broken DB connection (the route's try/catch owns that).

   Symbol conventions:
   • "WTI" / "BRENT" → latest_quotes + daily_prices (the oil module's
     resolved stores) for price/series; regime_snapshots CL=F / BZ=F
     for the trend read (same asset, futures symbol).
   • anything else → market_bars ('adj') for series/price, then
     regime_snapshots / bull_snapshots for the trend read.
──────────────────────────────────────────────────────────────── */

import { Queryable } from "../storage/db";
import { getDailySeries, getLatestQuotes } from "../storage/priceRepo";
import { getLatestTapeSnapshot } from "../storage/tapeRepo";
import { getLatestMacroSnapshot } from "../storage/macroRepo";
import { getLatestPositioning } from "../storage/positioningRepo";
import { MarketContext, RealizedVol, TrendRead } from "./types";

const OIL_BENCHMARKS = new Set(["WTI", "BRENT"]);
/** Oil benchmark → the futures symbol the Money Line scan tracks. */
const TREND_SYMBOL_FOR: Record<string, string> = { WTI: "CL=F", BRENT: "BZ=F" };

const SERIES_LOOKBACK_DAYS = 400; // enough for ~250 sessions of returns
const VOL_WINDOW_SESSIONS = 120;

/** Realized daily log-return σ over the trailing window — pure. */
export function realizedVolFrom(series: { date: string; close: number }[], windowSessions = VOL_WINDOW_SESSIONS): RealizedVol | null {
  const pts = series.filter((p) => p.close > 0);
  if (pts.length < 21) return null;
  const window = pts.slice(-Math.min(windowSessions + 1, pts.length));
  const rets: number[] = [];
  for (let i = 1; i < window.length; i++) rets.push(Math.log(window[i].close / window[i - 1].close));
  if (rets.length < 20) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varSum = rets.reduce((a, r) => a + (r - mean) ** 2, 0);
  const sigma = Math.sqrt(varSum / (rets.length - 1));
  return {
    dailySigma: sigma,
    windowDays: windowSessions,
    observations: rets.length,
    asOf: window[window.length - 1].date,
  };
}

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

async function trendFor(db: Queryable, symbol: string): Promise<TrendRead | null> {
  // regime_snapshots first (macro-30 — carries explicit daily/weekly trends)
  const reg = await db.query(
    `select symbol, verdict, daily_trend, weekly_trend, run_date from regime_snapshots
      where symbol = $1 and run_date = (select max(run_date) from regime_snapshots)
      limit 1`,
    [symbol],
  );
  const r = reg.rows[0];
  if (r) {
    return {
      symbol: String(r.symbol),
      verdict: String(r.verdict),
      dailyTrend: Number(r.daily_trend),
      weeklyTrend: Number(r.weekly_trend),
      runDate: r.run_date instanceof Date ? r.run_date.toISOString().slice(0, 10) : String(r.run_date).slice(0, 10),
      source: "regime_snapshots",
    };
  }
  const bull = await db.query(
    `select symbol, verdict, daily_trend, weekly_trend, run_date from bull_snapshots
      where symbol = $1 and run_date = (select max(run_date) from bull_snapshots)
      limit 1`,
    [symbol],
  );
  const b = bull.rows[0];
  if (b) {
    return {
      symbol: String(b.symbol),
      verdict: String(b.verdict),
      dailyTrend: Number(b.daily_trend),
      weeklyTrend: Number(b.weekly_trend),
      runDate: b.run_date instanceof Date ? b.run_date.toISOString().slice(0, 10) : String(b.run_date).slice(0, 10),
      source: "bull_snapshots",
    };
  }
  return null;
}

/** Assemble everything the engines may check. Never throws for a
 *  missing feed — each read degrades to null in isolation. */
export async function assembleMarketContext(db: Queryable, instrument: string): Promise<MarketContext> {
  const asOf = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - SERIES_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const oil = OIL_BENCHMARKS.has(instrument);

  let price: MarketContext["price"] = null;
  let priceSeries: MarketContext["priceSeries"] = [];

  if (oil) {
    try {
      const quotes = await getLatestQuotes(db);
      const q = quotes.find((x) => x.benchmark === instrument);
      if (q) price = { symbol: instrument, value: q.price, asOf: q.observedAt.slice(0, 10), source: `latest_quotes/${q.source}` };
    } catch { /* isolated */ }
    try {
      const rows = await getDailySeries(db, instrument as "WTI" | "BRENT", fromDate, asOf);
      priceSeries = rows.map((r) => ({ date: r.periodDate, close: r.price }));
      if (!price && priceSeries.length > 0) {
        const last = priceSeries[priceSeries.length - 1];
        price = { symbol: instrument, value: last.close, asOf: last.date, source: "daily_prices" };
      }
    } catch { /* isolated */ }
  } else {
    try {
      priceSeries = await barSeries(db, instrument, fromDate);
      if (priceSeries.length > 0) {
        const last = priceSeries[priceSeries.length - 1];
        price = { symbol: instrument, value: last.close, asOf: last.date, source: "market_bars/adj" };
      }
    } catch { /* isolated */ }
  }

  let tape: MarketContext["tape"] = null;
  try {
    const t = await getLatestTapeSnapshot(db);
    if (t && t.stance !== "PENDING") tape = { stance: t.stance, label: t.label, headline: t.headline, runDate: t.runDate };
  } catch { /* isolated */ }

  let macro: MarketContext["macro"] = null;
  try {
    const m = await getLatestMacroSnapshot(db);
    if (m && m.quadrant !== "PENDING") {
      macro = {
        quadrant: m.quadrant,
        growthMomentum: m.growthMomentum,
        inflationMomentum: m.inflationMomentum,
        pressureScore: m.pressureScore,
        diverging: m.diverging,
        runDate: m.runDate,
      };
    }
  } catch { /* isolated */ }

  let positioning: MarketContext["positioning"] = null;
  try {
    const p = await getLatestPositioning(db);
    if (p) positioning = { stance: p.stance, netLength: p.netLength, percentile1y: p.percentile1y, reportDate: p.reportDate };
  } catch { /* isolated */ }

  let trend: MarketContext["trend"] = null;
  try {
    trend = await trendFor(db, oil ? TREND_SYMBOL_FOR[instrument] : instrument);
  } catch { /* isolated */ }

  return {
    asOf,
    price,
    priceSeries,
    realizedVol: realizedVolFrom(priceSeries),
    tape,
    macro,
    positioning,
    trend,
    oilAdjacent: oil,
  };
}

/** Close series for arbitrary symbols (risk engine correlations). Oil
 *  benchmarks ride daily_prices; everything else market_bars. */
export async function closeSeriesFor(db: Queryable, symbol: string, lookbackDays = SERIES_LOOKBACK_DAYS): Promise<{ date: string; close: number }[]> {
  const asOf = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  if (OIL_BENCHMARKS.has(symbol)) {
    try {
      const rows = await getDailySeries(db, symbol as "WTI" | "BRENT", fromDate, asOf);
      return rows.map((r) => ({ date: r.periodDate, close: r.price }));
    } catch {
      return [];
    }
  }
  try {
    return await barSeries(db, symbol, fromDate);
  } catch {
    return [];
  }
}
