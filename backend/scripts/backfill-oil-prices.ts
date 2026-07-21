/* ────────────────────────────────────────────────────────────────
   One-shot EIA settlement backfill for Oil Tracker daily_prices.

   fetchLatest only keeps a short trailing window; this script pulls
   a long range (default 180 calendar days), inserts observations,
   and re-resolves every period so brent_wti_spread has enough closes.

   Usage:
     npx tsx scripts/backfill-oil-prices.ts [--days 180]
     npm run backfill:oil-prices
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl, ensureEnvVar } from "./loadEnv";
ensureDatabaseUrl();
ensureEnvVar("EIA_API_KEY");

import { BENCHMARKS, type Benchmark, type PriceRecord } from "../src/core/types";
import type { OilPriceSource } from "../src/sources/OilPriceSource";
import { buildSources } from "../src/sources/registry";
import { createDb } from "../src/storage/db";
import {
  getObservationsForPeriod,
  getSettlementPeriods,
  insertObservations,
  reenableSource,
  upsertDailyPrice,
} from "../src/storage/priceRepo";
import { resolveDailyClose } from "../src/ingest/resolve";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseDays(argv: string[]): number {
  const i = argv.indexOf("--days");
  if (i === -1 || !argv[i + 1]) return 180;
  const n = Number(argv[i + 1]);
  if (!Number.isFinite(n) || n < 10 || n > 2000) {
    throw new Error(`--days expects 10..2000, got ${argv[i + 1]}`);
  }
  return Math.floor(n);
}

async function fetchRangeWithRetry(
  source: OilPriceSource,
  benchmark: Benchmark,
  from: string,
  to: string,
  attempts = 3,
): Promise<PriceRecord[]> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await source.fetchRange(benchmark, from, to);
    } catch (e) {
      lastErr = e;
      const wait = 2_000 * (i + 1);
      console.warn(`  retry ${i + 1}/${attempts} ${benchmark} ${from}→${to} after ${wait}ms: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  const days = parseDays(process.argv.slice(2));
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const eia = buildSources().find((s) => s.descriptor.id === "eia");
  if (!eia) throw new Error("EIA source not registered");

  const db = await createDb();
  const allSources = buildSources();
  const lookup = (id: string) => {
    const s = allSources.find((x) => x.descriptor.id === id);
    return s
      ? s.descriptor
      : { priority: 99, expectedCadenceMs: 86_400_000, publicationLagBusinessDays: 4 };
  };

  console.log(`EIA backfill ${from} → ${to} (${days}d)`);

  // Unstick sources permanently disabled by a prior missing-key auth failure.
  await reenableSource(db, "fred");
  console.log("  re-enabled fred source_health (no-op if already enabled)");

  // Chunked windows — a single 180d EIA request sometimes 504s; 45d is
  // reliable and still finishes in a few requests per benchmark.
  const CHUNK_DAYS = 45;
  const chunks: { from: string; to: string }[] = [];
  {
    let cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end) {
      const chunkStart = cursor.toISOString().slice(0, 10);
      const chunkEndDate = new Date(cursor.getTime() + (CHUNK_DAYS - 1) * 86_400_000);
      const chunkEnd = (chunkEndDate > end ? end : chunkEndDate).toISOString().slice(0, 10);
      chunks.push({ from: chunkStart, to: chunkEnd });
      cursor = new Date(chunkEndDate.getTime() + 86_400_000);
    }
  }

  let written = 0;
  for (const b of BENCHMARKS as Benchmark[]) {
    let fetched = 0;
    let inserted = 0;
    for (const chunk of chunks) {
      const records = await fetchRangeWithRetry(eia, b, chunk.from, chunk.to);
      const n = await insertObservations(db, records);
      fetched += records.length;
      inserted += n;
      console.log(`  ${b} ${chunk.from}→${chunk.to}: fetched ${records.length}, inserted ${n}`);
      await sleep(1_200); // stay under EIA's soft throttle
    }
    written += inserted;
    console.log(`  ${b} total: fetched ${fetched}, inserted ${inserted}`);
  }

  let resolved = 0;
  for (const b of BENCHMARKS as Benchmark[]) {
    const periods = await getSettlementPeriods(db, b, from);
    for (const period of periods) {
      const periodObs = await getObservationsForPeriod(db, b, period);
      const daily = resolveDailyClose(b, period, periodObs, lookup);
      if (daily) {
        await upsertDailyPrice(db, daily);
        resolved++;
      }
    }
    console.log(`  ${b}: resolved ${periods.length} periods`);
  }

  console.log(`done — observations written ${written}, daily closes upserted ${resolved}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
