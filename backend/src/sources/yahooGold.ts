/* ────────────────────────────────────────────────────────────────
   Yahoo Finance gold adapter — deep, keyless daily history for Gold
   Tracker. Replaces the old FRED series (GOLDAMGBD228NLBM), which FRED
   discontinued in 2022 when ICE Benchmark Administration pulled the
   LBMA Gold Price dataset (fred.stlouisfed.org/series/GOLDAMGBD228NLBM
   now redirects to FRED's own removal notice — every fetch against it
   returned an HTML error page, not CSV).

   GET https://query1.finance.yahoo.com/v8/finance/chart/GC=F
     ?period1={unixStart}&period2={unixEnd}&interval=1d
     → { chart: { result: [{ timestamp: number[],
                              indicators: { quote: [{ close }] } }] } }

   GC=F is COMEX gold futures (continuous front-month) — there is no
   keyless spot-gold (XAU) symbol on this endpoint (XAU=X / XAUUSD=X
   both 404). Futures track spot closely (small, expiry-converging
   basis) and are the standard free proxy used across the industry.

   Unofficial/undocumented endpoint (no formal SLA), but it's the same
   API a huge number of open-source finance tools rely on, and it
   verified reliably during setup: proper daily granularity, ~3775
   points over a 15y window (fetched via explicit period1/period2 —
   the `range=max&interval=1d` shorthand silently downsamples to ~10
   points/year instead of daily, so this module always uses explicit
   unix-second bounds).

   GoldAPI.io (sources/goldapi.ts) stays the freshest live tick (its
   role is unchanged, still capped at 100 req/month); this module's
   only job is deep history for 1Y/5Y/10Y changes and trend/momentum/
   volatility.

   Two lookback modes, both just different `lookbackDays`:
   - Backfill (scripts/backfill-gold.ts): ~15y, run once to seed deep
     history so long-horizon changes are live from day one.
   - Incremental (ingest/goldCycle.ts, every cron run): ~10 days, just
     enough to catch the newest rows cheaply.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { getJsonForSource } from "./http";
import { MacroObservation, MacroSeries } from "./fredMacro";

const SOURCE_ID = "yahoo-gold";
const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/GC=F";
const SYMBOL = "GC=F";

/** Incremental lookback — a cron run only needs to catch up the last
 *  few days' new rows. */
export const GOLD_INCREMENTAL_LOOKBACK_DAYS = 10;

/** Backfill lookback — enough for a genuine 10-year change. */
export const GOLD_BACKFILL_LOOKBACK_DAYS = 15 * 365;

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }> | null;
    error?: { code?: string; description?: string } | null;
  };
}

function toDateStr(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export async function fetchGoldPriceSeries(
  opts: { now?: Date; lookbackDays?: number } = {},
): Promise<MacroSeries> {
  const now = opts.now ?? new Date();
  const lookbackDays = opts.lookbackDays ?? GOLD_INCREMENTAL_LOOKBACK_DAYS;
  const period1 = Math.floor(now.getTime() / 1000) - lookbackDays * 86_400;
  const period2 = Math.floor(now.getTime() / 1000);

  const url = `${BASE_URL}?period1=${period1}&period2=${period2}&interval=1d`;
  const body = await getJsonForSource<YahooChartResponse>(SOURCE_ID, url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; a3ro-gold-tracker/1.0)" },
  });

  const err = body.chart?.error;
  if (err) {
    throw new SourceError(SOURCE_ID, "bad_payload", `Yahoo chart error for ${SYMBOL}: ${err.description ?? err.code}`);
  }

  const result = body.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  if (timestamps.length === 0) {
    throw new SourceError(SOURCE_ID, "bad_payload", `Yahoo chart returned no rows for ${SYMBOL}`);
  }

  const observations: MacroObservation[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const value = closes[i];
    if (typeof value !== "number" || !Number.isFinite(value)) continue; // holiday/missing session
    observations.push({ date: toDateStr(timestamps[i]), value });
  }

  return {
    seriesId: SYMBOL,
    key: "gold_price",
    axis: "gold",
    frequency: "daily",
    units: "USD/troy oz",
    observations,
  };
}
