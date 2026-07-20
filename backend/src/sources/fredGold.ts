/* ────────────────────────────────────────────────────────────────
   FRED gold adapter — deep, keyless daily history for Gold Tracker.
   Reuses fetchFredSeries (sources/fredMacro.ts) for the fetch/parse/
   error-mapping logic; only the series config here is gold-specific.

   GOLDAMGBD228NLBM — Gold Fixing Price 3:00 P.M. (London time) in the
   London Bullion Market, in U.S. Dollars (Fed H.10 release). Keyless
   via the same fredgraph.csv endpoint fredMacro.ts uses (no
   FRED_API_KEY needed). Daily history back to 1968.

   GoldAPI.io (sources/goldapi.ts) is capped at 100 req/month, nowhere
   near enough to accumulate the years of history 1Y/5Y/10Y changes
   and trend/momentum/volatility need. This series does that job
   instead — free, keyless, decades of history in one fetch. GoldAPI's
   role narrows to just the freshest live tick (sources/goldapi.ts).

   Two lookback modes, both just different `lookbackDays`:
   - Backfill (scripts/backfill-gold.ts): ~15y, run once to seed deep
     history so long-horizon changes are live from day one.
   - Incremental (ingest/goldCycle.ts, every cron run): ~10 days, just
     enough to catch the newest rows cheaply.
──────────────────────────────────────────────────────────────── */

import { FredSeriesConfig, MacroSeries, fetchFredSeries } from "./fredMacro";

export const GOLD_SERIES: FredSeriesConfig = {
  seriesId: "GOLDAMGBD228NLBM",
  key: "gold_price",
  label: "Gold Fixing Price, London Bullion Market",
  axis: "gold",
  frequency: "daily",
  units: "USD/troy oz",
};

/** Incremental lookback — a cron run only needs to catch up the last
 *  few days' new rows. */
export const GOLD_INCREMENTAL_LOOKBACK_DAYS = 10;

/** Backfill lookback — enough for a genuine 10-year change. */
export const GOLD_BACKFILL_LOOKBACK_DAYS = 15 * 365;

export async function fetchGoldPriceSeries(
  opts: { now?: Date; lookbackDays?: number; fetchImpl?: typeof fetch } = {},
): Promise<MacroSeries> {
  return fetchFredSeries(GOLD_SERIES, {
    now: opts.now,
    lookbackDays: opts.lookbackDays ?? GOLD_INCREMENTAL_LOOKBACK_DAYS,
    fetchImpl: opts.fetchImpl,
  });
}
