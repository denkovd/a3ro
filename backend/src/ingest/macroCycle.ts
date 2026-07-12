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
import { computeMacroPressure, computeMacroRegime } from "../macro/engine";
import { fetchMacroPanel } from "../sources/fredMacro";
import { getDailySeries } from "../storage/priceRepo";
import { upsertMacroSnapshot } from "../storage/macroRepo";
import { Queryable } from "../storage/db";

export interface MacroCycleReport {
  startedAt: string;
  runDate: string;
  quadrant?: string;
  pressureScore?: number | null;
  diverging?: boolean;
  written: number;
  error?: string;
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

export async function runMacroCycle(
  db: Queryable,
  opts: { now?: () => Date } = {},
): Promise<MacroCycleReport> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  const runDate = startedAt.slice(0, 10);

  try {
    const panel = await fetchMacroPanel({ now: started });
    const growth = panel.find((s) => s.key === "growth_indpro")?.observations ?? [];
    const inflation = panel.find((s) => s.key === "inflation_cpi")?.observations ?? [];

    const regime = computeMacroRegime(growth, inflation, runDate);
    const mom = await oilMomentum(db, runDate, 60);
    const pressure = computeMacroPressure(panel, mom, runDate);

    const written = await upsertMacroSnapshot(db, regime, pressure);
    return {
      startedAt,
      runDate,
      quadrant: regime.quadrant,
      pressureScore: pressure.score,
      diverging: pressure.diverging,
      written,
    };
  } catch (e) {
    if (e instanceof SourceError) {
      return { startedAt, runDate, written: 0, error: `${e.kind}: ${e.message}` };
    }
    const err = new SourceError("fred-macro", "bad_payload", String(e), { cause: e });
    return { startedAt, runDate, written: 0, error: err.message };
  }
}
