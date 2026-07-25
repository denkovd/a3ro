/* ────────────────────────────────────────────────────────────────
   Macro cycle — fetches the keyless FRED panel, computes the GRID
   regime (P·06) + Macro pressure (#5) together, and upserts one
   macro_snapshots row. Sibling to seasonalCycle.ts; same isolation
   posture: never throws — SourceError is captured in the report,
   unknown throws are wrapped as bad_payload.

   Runs from the daily cron AFTER price ingestion (it reads WTI closes
   from daily_prices for the oil-momentum divergence input). The seven
   CSV fetches are small and keyless, so this runs every day with no
   freshness guard — the monthly series simply repeat until they update.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import {
  computeLiquidityStress,
  computeMacroPressure,
  computeMacroRegime,
  computeNominalGrowth,
  netLiquiditySeries,
} from "../macro/engine";
import { computeSixCycles } from "../macro/cycles";
import { computeRiskMatrix, computeVams, VamsRead } from "../macro/vams";
import { fetchGlobalBondStress } from "../macro/globalBonds";
import { REGIME_UNIVERSE } from "../regime/universe";
import { RegimeBar } from "../regime/types";
import { fetchMacroPanel, MacroSeries } from "../sources/fredMacro";
import { getDailySeries } from "../storage/priceRepo";
import { loadBars } from "../storage/bullRepo";
import { upsertMacroSnapshot } from "../storage/macroRepo";
import { Queryable } from "../storage/db";

export interface MacroCycleReport {
  startedAt: string;
  runDate: string;
  quadrant?: string;
  pressureScore?: number | null;
  diverging?: boolean;
  /** Liquidity stress composite (docs/regime-macro-refresh.md). */
  liquidityScore?: number | null;
  riskPremiumAlert?: boolean;
  /** Ticker the global-bond leg resolved to, or null if it fell through
   *  the whole fallback chain (Yahoo down / all tickers dead). */
  globalBondSymbol?: string | null;
  /** Regime the MARKET is pricing (VAMS risk matrix) — separate from
   *  `quadrant`, which is the economy's. */
  marketRegime?: string;
  marketScored?: number;
  cyclesHeadwinds?: number;
  /** Optional FRED series that failed this run. Present = some legs
   *  read pending; the run still wrote a snapshot. */
  seriesErrors?: string[];
  written: number;
  error?: string;
  /** The fetched FRED panel, exposed so goldCycle.ts can reuse it
   *  instead of re-fetching all seven series itself. Undefined if the
   *  fetch failed. */
  panel?: MacroSeries[];
}

/** WTI % change over ~`days` from daily_prices, or null if unavailable. */
async function oilMomentum(db: Queryable, to: string, days: number): Promise<number | null> {
  const from = new Date(new Date(`${to}T00:00:00Z`).getTime() - (days + 20) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  try {
    const rows = await getDailySeries(db, "WTI", from, to);
    if (rows.length < 2) return null;
    const latest = rows[rows.length - 1];
    // first row on/after the target window start
    const targetDate = new Date(new Date(`${latest.periodDate}T00:00:00Z`).getTime() - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    let base = rows[0];
    for (const r of rows) {
      if (r.periodDate <= targetDate) base = r;
      else break;
    }
    return base.price !== 0 ? ((latest.price - base.price) / Math.abs(base.price)) * 100 : null;
  } catch {
    return null;
  }
}

/**
 * VAMS across the cross-asset universe, read from market_bars — the
 * bars the daily bull scan already stores (its "macro" tier reuses
 * REGIME_UNIVERSE verbatim, so every symbol here is covered).
 * Deliberately NOT a fresh Yahoo pull: 30 more HTTP requests per run
 * to re-fetch data we hold would add a large new failure surface to a
 * cycle whose whole job is to be cheap and keyless.
 *
 * TIMING — this reads one session behind. The Vercel ingest cron runs
 * at 06:00 UTC; the bull scan that writes these bars runs at 06:20.
 * So the matrix scores yesterday's closes, which is correct for a
 * close-based signal but means the matrix is NOT intraday-fresh. It
 * also means the matrix reads PENDING until the first bull scan has
 * run on a new database. Both are fine; both are invisible without
 * this note.
 *
 * Symbols missing from the store are simply unscored, which the matrix
 * reports as coverage rather than hiding.
 */
async function loadVamsReads(db: Queryable): Promise<VamsRead[]> {
  const reads: VamsRead[] = [];
  for (const entry of REGIME_UNIVERSE) {
    let bars: RegimeBar[] = [];
    try {
      bars = await loadBars(db, entry.symbol, "adj");
    } catch {
      // one unreadable symbol must not take the matrix down
    }
    reads.push(computeVams(bars, entry.symbol, entry.displayName));
  }
  return reads;
}

/** Bars for one symbol, empty on any failure. */
async function barsOrEmpty(db: Queryable, symbol: string): Promise<RegimeBar[]> {
  try {
    return await loadBars(db, symbol, "adj");
  } catch {
    return [];
  }
}

export async function runMacroCycle(
  db: Queryable,
  opts: { now?: () => Date } = {},
): Promise<MacroCycleReport> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  const runDate = startedAt.slice(0, 10);

  try {
    // Optional series degrade their own leg; the two GRID axes still
    // throw. Failures are surfaced on the report, never swallowed —
    // a series that quietly stops updating must be visible in the run
    // log, not just as a tile that says "pending" forever.
    const seriesErrors: string[] = [];
    const panel = await fetchMacroPanel({
      now: started,
      onSeriesError: (f) => seriesErrors.push(`${f.seriesId}: ${f.error}`),
    });
    const growth = panel.find((s) => s.key === "growth_indpro")?.observations ?? [];
    const inflation = panel.find((s) => s.key === "inflation_cpi")?.observations ?? [];

    // ── layer 1: bottom-up economic GRID ──
    const regime = computeMacroRegime(growth, inflation, runDate);

    // ── the oil overlay, unchanged: the Oil Tracker's Macro Override
    // chip reads these exact fields and must not regress ──
    const mom = await oilMomentum(db, runDate, 60);
    const pressure = computeMacroPressure(panel, mom, runDate);

    // ── layer 2: top-down market regime (VAMS risk matrix) ──
    const matrix = computeRiskMatrix(await loadVamsReads(db), runDate);

    // ── cost-of-capital / liquidity layer (24 Jul read) ──
    // Yahoo leg is isolated: a failure degrades one leg, not the run.
    const globalBonds = await fetchGlobalBondStress().catch(() => null);
    const liquidity = computeLiquidityStress(panel, globalBonds, runDate);
    const nominal = computeNominalGrowth(
      panel.find((s) => s.key === "nominal_gdp")?.observations ?? [],
      runDate,
    );

    // ── layer 3: the six cycles ──
    // netLiquiditySeries is computed once and shared so the liquidity
    // tile and the liquidity stress leg can never disagree.
    const sixCycles = computeSixCycles(
      panel,
      netLiquiditySeries(panel),
      await barsOrEmpty(db, "^GSPC"),
      await barsOrEmpty(db, "HYG"),
      runDate,
    );

    const written = await upsertMacroSnapshot(
      db, regime, pressure, liquidity, nominal, globalBonds, matrix, sixCycles,
    );
    return {
      startedAt,
      runDate,
      quadrant: regime.quadrant,
      pressureScore: pressure.score,
      diverging: pressure.diverging,
      liquidityScore: liquidity.score,
      riskPremiumAlert: liquidity.riskPremiumAlert,
      globalBondSymbol: globalBonds?.symbol ?? null,
      marketRegime: matrix.modalRegime,
      marketScored: matrix.scored,
      cyclesHeadwinds: sixCycles.headwinds,
      seriesErrors: seriesErrors.length > 0 ? seriesErrors : undefined,
      written,
      panel,
    };
  } catch (e) {
    if (e instanceof SourceError) {
      return { startedAt, runDate, written: 0, error: `${e.kind}: ${e.message}` };
    }
    const err = new SourceError("fred-macro", "bad_payload", String(e), { cause: e });
    return { startedAt, runDate, written: 0, error: err.message };
  }
}
