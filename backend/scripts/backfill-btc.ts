/* ────────────────────────────────────────────────────────────────
   One-time backfill of btc_prices from Coinbase's keyless candles
   endpoint (~400d of daily closes — enough for this phase's y1 leg
   plus buffer) — run once before the daily cron so d1/w1/m1/y1
   changes are live from day one instead of after a year of
   cron-only accumulation:

     cd backend && npx tsx scripts/backfill-btc.ts

   Idempotent: upserts on run_date, safe to re-run.
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { fetchBtcPriceSeries, BTC_BACKFILL_LOOKBACK_DAYS } from "../src/sources/coinbaseBtc";
import { upsertBtcPrices } from "../src/storage/btcRepo";

async function main(): Promise<void> {
  const db = await createDb();
  const series = await fetchBtcPriceSeries({ lookbackDays: BTC_BACKFILL_LOOKBACK_DAYS });
  const written = await upsertBtcPrices(db, series, "coinbase-candle");

  console.log(`BTC backfill · ${series.length} Coinbase observations, ${written} written`);
  if (series.length > 0) {
    console.log(`range: ${series[0].date} .. ${series[series.length - 1].date}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
