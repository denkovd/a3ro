/* ────────────────────────────────────────────────────────────────
   Regime scan cycle — sibling to corridorPipeline.ts. Runs from the
   same daily 06:00 UTC cron, wrapped in its own try/catch there so
   it can NEVER take down price ingestion.

   Per-symbol isolation: one ticker failing (Yahoo hiccup, delisted
   symbol, null-ridden payload) records an error in the report and
   the other 29 still scan. Fetches run through a small concurrency
   pool — 30 once-a-day requests is far inside the self-imposed
   Yahoo budget (yfinance.ts: 60/hr), but we still avoid firing all
   30 at the same instant.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { Queryable } from "../storage/db";
import { upsertRegimeSnapshots } from "../storage/regimeRepo";
import { computeRegime, rankSnapshots } from "./engine";
import { RegimeBar, RegimeSnapshot, UniverseEntry } from "./types";
import { REGIME_UNIVERSE } from "./universe";
import { fetchDailyHistory } from "./yahooHistory";

const FETCH_CONCURRENCY = 4;

export interface RegimeCycleReport {
  startedAt: string;
  runDate: string;
  universe: number;
  scanned: { symbol: string; ok: boolean; verdict?: string; bars?: number; error?: string }[];
  written: number;
  newlyBullish: string[];
}

export interface RegimeCycleOptions {
  universe?: UniverseEntry[];
  /** Injectable for tests — defaults to the Yahoo history fetcher. */
  fetchHistory?: (symbol: string) => Promise<RegimeBar[]>;
  now?: () => Date;
}

export async function runRegimeCycle(
  db: Queryable,
  opts: RegimeCycleOptions = {},
): Promise<RegimeCycleReport> {
  const universe = opts.universe ?? REGIME_UNIVERSE;
  const fetchHistory = opts.fetchHistory ?? fetchDailyHistory;
  const now = opts.now ?? (() => new Date());

  const startedAt = now().toISOString();
  const runDate = startedAt.slice(0, 10); // UTC calendar day of the run

  const report: RegimeCycleReport = {
    startedAt,
    runDate,
    universe: universe.length,
    scanned: [],
    written: 0,
    newlyBullish: [],
  };

  // Concurrency pool: FETCH_CONCURRENCY workers draining one queue.
  const queue = [...universe];
  const snapshots: RegimeSnapshot[] = [];
  async function worker(): Promise<void> {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      try {
        const bars = await fetchHistory(entry.symbol);
        const snap = computeRegime(entry, bars, runDate);
        snapshots.push(snap);
        report.scanned.push({
          symbol: entry.symbol, ok: true,
          verdict: snap.verdict, bars: snap.daily.bars,
        });
      } catch (e) {
        const msg = e instanceof SourceError ? `${e.kind}: ${e.message}`
          : e instanceof Error ? e.message : String(e);
        report.scanned.push({ symbol: entry.symbol, ok: false, error: msg });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, universe.length) }, worker),
  );

  const ranked = rankSnapshots(snapshots);
  report.written = await upsertRegimeSnapshots(db, ranked);
  report.newlyBullish = ranked.filter((s) => s.newlyBullish).map((s) => s.symbol);
  // Deterministic report order (workers finish out of order).
  report.scanned.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return report;
}
