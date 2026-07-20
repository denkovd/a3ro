/* ────────────────────────────────────────────────────────────────
   One-time backfill of gold_prices from FRED's keyless GOLDAMGBD228NLBM
   series (~15y of daily closes) — run once before the daily cron so
   1Y/5Y/10Y changes and trend/momentum/volatility are live from day
   one instead of after years of cron-only accumulation:

     cd backend && npx tsx scripts/backfill-gold.ts

   Idempotent: upserts on run_date, safe to re-run.
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { fetchGoldPriceSeries, GOLD_BACKFILL_LOOKBACK_DAYS } from "../src/sources/fredGold";
import { upsertGoldPrices } from "../src/storage/goldRepo";

async function main(): Promise<void> {
  const db = await createDb();
  const series = await fetchGoldPriceSeries({ lookbackDays: GOLD_BACKFILL_LOOKBACK_DAYS });
  const written = await upsertGoldPrices(db, series.observations, "fred");

  console.log(`Gold backfill · ${series.observations.length} FRED observations, ${written} written`);
  if (series.observations.length > 0) {
    const first = series.observations[0];
    const last = series.observations[series.observations.length - 1];
    console.log(`range: ${first.date} .. ${last.date}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
