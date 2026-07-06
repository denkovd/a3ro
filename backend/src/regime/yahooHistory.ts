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
   - bar timestamps are the bar's OPEN time; the UTC calendar date of
     that instant is the trading date for every symbol we track
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

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: Record<string, unknown>;
      timestamp?: (number | null)[];
      indicators?: { quote?: YahooQuote[] };
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
    bars.push({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      open, high, low, close,
    });
  }

  // Defensive: Yahoo occasionally duplicates a trading date (e.g. a
  // correction row). Keep the LAST row per date, preserve order.
  const byDate = new Map<string, RegimeBar>();
  for (const b of bars) byDate.set(b.date, b);
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Fetch ~5y of daily bars for one symbol. Throws SourceError on
 *  network/HTTP problems (via getJsonForSource) or Error on payload
 *  problems — the cycle isolates failures per symbol either way. */
export async function fetchDailyHistory(symbol: string): Promise<RegimeBar[]> {
  const url = `${BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=${HISTORY_RANGE}`;
  const body = await getJsonForSource<YahooChartResponse>(REGIME_SOURCE_ID, url, {
    classifyHttpError: classifyYahooError,
  });
  return parseYahooDaily(body, symbol);
}
