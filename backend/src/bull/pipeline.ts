/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — scan pipeline.

   Designed for the GitHub Actions daily runner (a single
   long-lived process), NOT the Vercel cron — 700 symbols would
   blow any serverless budget. Vercel only reads.

   Per symbol, in order, all isolated per-symbol:
   1. Incremental fetch through the adapter chain (1mo window;
      5y backfill when the symbol has no stored bars yet).
   2. Upsert raw bars; mirror new bars into 'adj'.
   3. Futures only: fetch dated contracts, detect a roll by
      close-matching, back-shift 'adj' history, log the roll,
      run the verification probe. Any failure here flags the
      symbol and falls back to the raw series — a roll-detection
      failure on gold can never block BTC-USD or ^GSPC.
   4. Money Line on the closed 'adj' series (== raw for
      non-futures), strength v2, RS vs benchmark.
   Then globally, PER STRATEGY (strategies.ts — ml-dw / ml-weekly /
   ml-daily are lenses derived from the one base snapshot, zero
   extra fetches): rank, upsert snapshots, diff transitions.
   Finally write the adapter health log.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { closedDailyBars } from "../regime/engine";
import { RegimeBar } from "../regime/types";
import { Queryable } from "../storage/db";
import {
  getPreviousVerdicts,
  getRolls,
  insertHealthEntries,
  insertRoll,
  insertTransitions,
  latestBarDate,
  loadBars,
  shiftAdjBarsBefore,
  upsertBars,
  upsertBullSnapshots,
} from "../storage/bullRepo";
import {
  AdapterRegistry,
  defaultRegistry,
  fetchBarsWithFallback,
} from "./adapters";
import { computeBullSnapshot, computeTransitions, rankBullSnapshots } from "./engine";
import { deriveStrategySnapshots, BullStrategySnapshot, STRATEGIES } from "./strategies";
import { contractSymbols, detectRoll, verifyAdjustment } from "./rolls";
import {
  AdapterHealthEntry,
  BarRange,
  BullSnapshot,
  BullUniverseEntry,
  RollEvent,
} from "./types";
import { BULL_UNIVERSE, benchmarkFor } from "./universe";

const CONTRACT_CANDIDATES = 3;
const CONTRACT_RANGE: BarRange = "1mo";

export interface BullScanReport {
  startedAt: string;
  runDate: string;
  universe: number;
  scanned: number;
  failed: string[];
  rolls: RollEvent[];
  rollProbeFailures: string[];
  /** Transition rows across ALL strategies. */
  transitions: number;
  /** From the default ml-dw lens (report back-compat). */
  newlyBullish: string[];
  /** Snapshot rows across ALL strategies. */
  written: number;
  /** Rows written per strategy id. */
  writtenByStrategy: Record<string, number>;
}

export interface BullScanOptions {
  universe?: BullUniverseEntry[];
  registry?: AdapterRegistry;
  now?: () => Date;
  /** Injectable contract fetcher for tests (defaults to the registry's
   *  Yahoo adapter — dated contracts are a Yahoo-only concept). */
  fetchContract?: (symbol: string) => Promise<RegimeBar[]>;
  log?: (msg: string) => void;
}

export async function runBullScan(
  db: Queryable,
  opts: BullScanOptions = {},
): Promise<BullScanReport> {
  const universe = opts.universe ?? BULL_UNIVERSE;
  const registry = opts.registry ?? defaultRegistry(universe);
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const fetchContract =
    opts.fetchContract ??
    ((symbol: string) => registry.get("yahoo").fetchDailyBars(symbol, CONTRACT_RANGE));

  const startedAt = now().toISOString();
  const runDate = startedAt.slice(0, 10);

  const report: BullScanReport = {
    startedAt, runDate, universe: universe.length,
    scanned: 0, failed: [], rolls: [], rollProbeFailures: [],
    transitions: 0, newlyBullish: [], written: 0, writtenByStrategy: {},
  };

  const health: AdapterHealthEntry[] = [];
  const snapshots: BullSnapshot[] = [];
  /** closed adj series per symbol, kept for benchmark RS lookups. */
  const closedBySymbol = new Map<string, RegimeBar[]>();

  // Pass 1 — bars: fetch, store, roll-adjust. Sequential by design:
  // the in-process rate gate provides the politeness; per-symbol
  // try/catch provides the isolation.
  for (const entry of universe) {
    try {
      const have = await latestBarDate(db, entry.symbol, "raw");
      const range: BarRange = have === null ? "5y" : "1mo";
      const { bars, health: h } = await fetchBarsWithFallback(entry, range, runDate, registry);
      health.push(h);
      if (!bars) {
        report.failed.push(entry.symbol);
        log(`✗ ${entry.symbol}: all adapters failed — ${h.error}`);
        continue;
      }
      await upsertBars(db, entry.symbol, "raw", bars);
      // 'adj' is APPEND-ONLY from the fetch side: incremental windows
      // overlap ~1mo, and re-upserting overlapped dates would overwrite
      // roll-shifted history with raw values. New bars enter at raw
      // values; only shiftAdjBarsBefore ever mutates existing adj bars.
      const haveAdj = await latestBarDate(db, entry.symbol, "adj");
      const newForAdj = haveAdj === null ? bars : bars.filter((b) => b.date > haveAdj);
      if (newForAdj.length > 0) await upsertBars(db, entry.symbol, "adj", newForAdj);

      if (entry.futures) {
        await maybeRoll(db, entry, runDate, fetchContract, report, log);
      }

      const adj = await loadBars(db, entry.symbol, "adj");
      closedBySymbol.set(entry.symbol, closedDailyBars(adj, runDate));
      report.scanned++;
    } catch (e) {
      const msg = e instanceof SourceError ? `${e.kind}: ${e.message}`
        : e instanceof Error ? e.message : String(e);
      report.failed.push(entry.symbol);
      log(`✗ ${entry.symbol}: ${msg}`);
    }
  }

  // Pass 2 — snapshots (pure; benchmarks now all loaded).
  for (const entry of universe) {
    const closed = closedBySymbol.get(entry.symbol);
    if (!closed) continue;
    try {
      const benchSym = benchmarkFor(entry);
      const bench = benchSym ? closedBySymbol.get(benchSym) ?? null : null;
      const adjusted = !!entry.futures && !report.rollProbeFailures.includes(entry.symbol);
      snapshots.push(computeBullSnapshot(entry, closed, runDate, bench, adjusted));
    } catch (e) {
      report.failed.push(entry.symbol);
      log(`✗ ${entry.symbol} (compute): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Pass 3 — strategy lenses: derive per-strategy rows from each base
  // snapshot (pure), then rank / diff / write PER STRATEGY. The diff
  // guard is per-lens too: a strategy's first ever run sees an empty
  // previous map and produces no transition spam (spec §3).
  const byStrategy = new Map<string, BullStrategySnapshot[]>();
  for (const meta of STRATEGIES) byStrategy.set(meta.id, []);
  for (const base of snapshots) {
    for (const lensed of deriveStrategySnapshots(base)) {
      byStrategy.get(lensed.strategy)!.push(lensed);
    }
  }

  for (const meta of STRATEGIES) {
    const ranked = rankBullSnapshots(byStrategy.get(meta.id)!);
    const previous = await getPreviousVerdicts(db, runDate, meta.id);
    const transitions = computeTransitions(previous, ranked)
      .map((t) => ({ ...t, strategy: meta.id }));

    const written = await upsertBullSnapshots(db, ranked);
    report.written += written;
    report.writtenByStrategy[meta.id] = written;
    report.transitions += await insertTransitions(db, transitions);

    if (meta.id === "ml-dw") {
      report.newlyBullish = ranked.filter((s) => s.newlyBullish).map((s) => s.symbol);
    }
  }

  await insertHealthEntries(db, health);
  return report;
}

/** Roll detection + adjustment for one futures symbol. Failures are
 *  contained here: the symbol is flagged (serves raw-equivalent adj)
 *  and the scan continues. */
async function maybeRoll(
  db: Queryable,
  entry: BullUniverseEntry,
  runDate: string,
  fetchContract: (symbol: string) => Promise<RegimeBar[]>,
  report: BullScanReport,
  log: (msg: string) => void,
): Promise<void> {
  const f = entry.futures!;
  try {
    const raw = await loadBars(db, entry.symbol, "raw");
    const recentRaw = raw.slice(-15);
    if (recentRaw.length < 2) return;

    const candidates = contractSymbols(
      f.root, f.suffix, f.months, recentRaw[0].date, CONTRACT_CANDIDATES,
    );
    const contractBars = new Map<string, RegimeBar[]>();
    for (const c of candidates) {
      try {
        contractBars.set(c, await fetchContract(c));
      } catch {
        // A missing candidate (not yet listed / expired) is routine.
      }
    }
    if (contractBars.size < 2) {
      log(`· ${entry.symbol}: <2 contract candidates fetched — roll check skipped`);
      return;
    }

    const priorRolls = await getRolls(db, entry.symbol);
    const priorCum = priorRolls.length > 0 ? priorRolls[priorRolls.length - 1].cumAdjustment : 0;
    const alreadyLogged = new Set(priorRolls.map((r) => r.rollDate));

    const roll = detectRoll(entry.symbol, recentRaw, contractBars, priorCum);
    if (!roll || alreadyLogged.has(roll.rollDate)) return;

    const shifted = await shiftAdjBarsBefore(db, entry.symbol, roll.rollDate, roll.gap);
    await insertRoll(db, roll);
    report.rolls.push(roll);
    log(`↻ ROLL ${entry.symbol} ${roll.rollDate}: ${roll.oldContract} → ${roll.newContract}, ` +
        `gap ${roll.gap.toFixed(4)}, cum ${roll.cumAdjustment.toFixed(4)}, ${shifted} bars shifted`);

    // Verification probe at a date safely inside pre-roll history.
    const adjAll = await loadBars(db, entry.symbol, "adj");
    const rawAll = await loadBars(db, entry.symbol, "raw");
    const preRoll = rawAll.filter((b) => b.date < roll.rollDate);
    const checkBar = preRoll[Math.max(0, preRoll.length - 30)];
    if (checkBar) {
      const allRolls = await getRolls(db, entry.symbol);
      const probe = verifyAdjustment(rawAll, adjAll, allRolls, checkBar.date);
      if (!probe.ok) {
        report.rollProbeFailures.push(entry.symbol);
        log(`⚠ ${entry.symbol}: roll probe FAILED — ${probe.detail}`);
      } else {
        log(`✓ ${entry.symbol}: roll probe ok (adj−raw=${probe.actualDelta.toFixed(4)} @ ${probe.checkedDate})`);
      }
    }
  } catch (e) {
    report.rollProbeFailures.push(entry.symbol);
    log(`⚠ ${entry.symbol}: roll handling failed (serving unadjusted) — ` +
        `${e instanceof Error ? e.message : String(e)}`);
  }
}
