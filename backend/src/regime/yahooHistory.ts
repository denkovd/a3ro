/* ────────────────────────────────────────────────────────────────
   Yahoo Finance daily-history fetcher for the regime scanner.
   Same unofficial v8 chart endpoint the oil module's yfinance.ts
   adapter already uses in production — but requesting RANGE data
   (5y of daily bars) instead of the latest tick. Unofficial and
   replaceable by design: swap fetchDailyHistory for any provider
   returning RegimeBar[] and nothing downstream changes.

   Quirks inherited from yfinance.ts (see that header for detail):
   - chart.error can be non-null even on HTTP 200 → classify from text
   - timestamp / quote arrays can contain nulls → skip those bars
   - bar timestamps are the bar's OPEN time. The trading date is the
     calendar date of that instant IN THE EXCHANGE'S OWN TIME ZONE
     (meta.exchangeTimezoneName), not in UTC. For most symbols the two
     agree. They differ for venues whose local midnight falls on the
     previous UTC day: Yahoo's "=X" FX pairs trade on a Europe/London
     calendar, so in British summer time a daily bar opens at 23:00 UTC
     the evening before and its UTC date is one day early. That bar
     runs to 23:00 UTC of its London date — after the US equity close —
     so the early label let a signal dated D−1 read prices from D.
     meta.gmtoffset is only the offset in force today; it cannot date a
     history that spans clock changes, so each bar is converted in the
     named zone and gmtoffset is a fallback only.
   - OHLC comes from indicators.quote[0] (unadjusted), matching how
     TradingView charts futures/crypto for the Money Line
──────────────────────────────────────────────────────────────── */

import { SourceErrorKind } from "../core/types";
import { getJsonForSource } from "../sources/http";
import { RegimeBar } from "./types";

export const REGIME_SOURCE_ID = "regime-yahoo";
const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

/** 5y of daily bars ≈ 1,260 rows: 20-week Donchian needs 20 closed
 *  weeks plus warm-up for the trend to establish — 5y is generous
 *  headroom while staying a single ~100 KB request per symbol. */
export const HISTORY_RANGE = "5y";

interface YahooQuote {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
}

export interface YahooChartMeta extends Record<string, unknown> {
  /** IANA zone of the listing venue, e.g. "Europe/London" for =X pairs. */
  exchangeTimezoneName?: string;
  /** Seconds east of UTC in force when the response was generated. */
  gmtoffset?: number;
  dataGranularity?: string;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: YahooChartMeta;
      timestamp?: (number | null)[];
      indicators?: { quote?: YahooQuote[]; adjclose?: { adjclose?: (number | null)[] }[] };
    }>;
    error?: { code: string; description: string } | null;
  };
}

function classifyYahooError(status: number, text: string): SourceErrorKind | undefined {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_error";
  if (status === 401 || status === 403) return "auth";
  if (/(throttl|rate|too many|exceed)/i.test(text)) return "rate_limited";
  return "bad_payload";
}

const utcDate = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString().slice(0, 10);
const zoneFormatters = new Map<string, Intl.DateTimeFormat | null>();
function zoneFormatter(zone: string): Intl.DateTimeFormat | null {
  if (!zoneFormatters.has(zone)) {
    let formatter: Intl.DateTimeFormat | null = null;
    // en-CA formats as YYYY-MM-DD. An unknown zone name throws RangeError.
    try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }); }
    catch { formatter = null; }
    zoneFormatters.set(zone, formatter);
  }
  return zoneFormatters.get(zone) ?? null;
}

/**
 * Trading date of a bar stamped at `epochSeconds`: its calendar date in the
 * exchange's zone, clock changes included. Falls back to the response's single
 * gmtoffset (correct only while that offset applied), then to the UTC date —
 * the behaviour before zones were read, and still right for UTC-dated venues.
 */
export function tradingDate(epochSeconds: number, meta?: YahooChartMeta | null): string {
  const zone = typeof meta?.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : null;
  const formatter = zone ? zoneFormatter(zone) : null;
  if (formatter) {
    const parts = formatter.formatToParts(new Date(epochSeconds * 1000));
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    const year = part("year"), month = part("month"), day = part("day");
    if (year && month && day) return `${year}-${month}-${day}`;
  }
  if (typeof meta?.gmtoffset === "number" && Number.isFinite(meta.gmtoffset)) return utcDate(epochSeconds + meta.gmtoffset);
  return utcDate(epochSeconds);
}

export interface YahooDateInspection {
  exchangeTimezoneName: string | null; gmtoffset: number | null; bars: number;
  /** Count of bars by the UTC hour they are stamped at. */
  utcHours: Record<string, number>;
  /** Bars whose exchange-zone date differs from their UTC date. */
  relabelled: number; firstRelabelled: { utc: string; exchange: string } | null;
  duplicateDates: number;
}
/** Diagnostic for `npm run verify:fx-dates`: how a payload's bars are stamped
 *  and how many change date once read in the exchange zone. Pure. */
export function inspectYahooDates(body: YahooChartResponse): YahooDateInspection {
  const result = body.chart?.result?.[0], meta = result?.meta;
  const stamps = (result?.timestamp ?? []).filter((t): t is number => typeof t === "number");
  const utcHours: Record<string, number> = {};
  let relabelled = 0, firstRelabelled: YahooDateInspection["firstRelabelled"] = null;
  const seen = new Set<string>();
  let duplicateDates = 0;
  for (const t of stamps) {
    const hour = String(new Date(t * 1000).getUTCHours()).padStart(2, "0");
    utcHours[hour] = (utcHours[hour] ?? 0) + 1;
    const utc = utcDate(t), exchange = tradingDate(t, meta);
    if (utc !== exchange) { relabelled++; firstRelabelled ??= { utc, exchange }; }
    if (seen.has(exchange)) duplicateDates++; else seen.add(exchange);
  }
  return { exchangeTimezoneName: typeof meta?.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : null,
    gmtoffset: typeof meta?.gmtoffset === "number" ? meta.gmtoffset : null, bars: stamps.length,
    utcHours, relabelled, firstRelabelled, duplicateDates };
}

/** Parse a raw Yahoo chart payload into clean daily bars (exported
 *  separately so fixture tests can exercise it without a network). */
export function parseYahooDaily(body: YahooChartResponse, symbol: string): RegimeBar[] {
  if (body.chart?.error) {
    const { code, description } = body.chart.error;
    throw new Error(`Yahoo error for ${symbol} — ${code}: ${description}`);
  }
  const result = body.chart?.result?.[0];
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!result || !Array.isArray(ts) || !q) {
    throw new Error(`Yahoo payload for ${symbol} missing timestamp/quote arrays`);
  }

  const bars: RegimeBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    if (
      typeof t !== "number" ||
      typeof open !== "number" || !Number.isFinite(open) ||
      typeof high !== "number" || !Number.isFinite(high) ||
      typeof low !== "number" || !Number.isFinite(low) ||
      typeof close !== "number" || !Number.isFinite(close)
    ) {
      continue; // Yahoo pads holidays/partial rows with nulls — routine
    }
    bars.push({ date: tradingDate(t, result.meta), open, high, low, close });
  }

  // Defensive: Yahoo occasionally duplicates a trading date (e.g. a
  // correction row). Keep the LAST row per date, preserve order.
  const byDate = new Map<string, RegimeBar>();
  for (const b of bars) byDate.set(b.date, b);
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Raw chart payload for a symbol, for diagnostics that need `meta` and the
 *  untouched timestamps (verify-fx-dates). Same endpoint and error handling. */
export async function fetchYahooChart(symbol: string, range: string = HISTORY_RANGE): Promise<YahooChartResponse> {
  return getJsonForSource<YahooChartResponse>(REGIME_SOURCE_ID,
    `${BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`, { classifyHttpError: classifyYahooError });
}

/** Fetch daily bars for one symbol. Defaults to HISTORY_RANGE (5y) —
 *  the daily scan's need. `range` is overridable for the affinity
 *  backtest, which wants "max": conditioning a regime affinity on five
 *  years means conditioning it on roughly one and a half regime
 *  cycles, which is not enough to separate signal from the particular
 *  decade. Throws SourceError on network/HTTP problems (via
 *  getJsonForSource) or Error on payload problems — the cycle isolates
 *  failures per symbol either way. */
export async function fetchDailyHistory(
  symbol: string,
  range: string = HISTORY_RANGE,
): Promise<RegimeBar[]> {
  // Yahoo silently coerces range=max to monthly bars. Explicit dates keep
  // the full signal history daily. This starts far before any research window.
  const query = range === "max"
    ? `period1=631152000&period2=${Math.floor(Date.now() / 1000)}&interval=1d`
    : `interval=1d&range=${range}`;
  const url = `${BASE_URL}/${encodeURIComponent(symbol)}?${query}`;
  const body = await getJsonForSource<YahooChartResponse>(REGIME_SOURCE_ID, url, {
    classifyHttpError: classifyYahooError,
  });
  if (body.chart?.result?.[0]?.meta?.dataGranularity && body.chart.result[0].meta.dataGranularity !== "1d")
    throw new Error(`Yahoo returned non-daily bars for ${symbol}; refusing to score a daily signal.`);
  return parseYahooDaily(body, symbol);
}

/** Dividend/split-adjusted ETF prices for portfolio returns, not signals. */
export async function fetchAdjustedHistory(symbol: string): Promise<RegimeBar[]> {
  const body = await getJsonForSource<YahooChartResponse>(REGIME_SOURCE_ID,
    `${BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&period1=631152000&period2=${Math.floor(Date.now() / 1000)}`, { classifyHttpError: classifyYahooError });
  return parseYahooAdjusted(body, symbol);
}

export function parseYahooAdjusted(body: YahooChartResponse, symbol: string): RegimeBar[] {
  const result = body.chart?.result?.[0];
  if (result?.meta?.dataGranularity && result.meta.dataGranularity !== "1d")
    throw new Error(`Yahoo returned non-daily adjusted history for ${symbol}.`);
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
  if (!adjusted) throw new Error(`Adjusted closes missing for ${symbol}; refusing a price-return fallback.`);
  const byDate = new Map<string, number>();
  result?.timestamp?.forEach((t, i) => {
    const close = adjusted[i];
    if (typeof t === "number" && typeof close === "number" && Number.isFinite(close) && close > 0)
      byDate.set(tradingDate(t, result?.meta), close);
  });
  return parseYahooDaily(body, symbol).map(bar => {
    const close = byDate.get(bar.date);
    if (close === undefined) throw new Error(`Adjusted close missing for ${symbol} on ${bar.date}.`);
    const scale = close / bar.close;
    return { ...bar, open: bar.open * scale, high: bar.high * scale, low: bar.low * scale, close };
  });
}
