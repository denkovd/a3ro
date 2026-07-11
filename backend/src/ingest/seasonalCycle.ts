/* ────────────────────────────────────────────────────────────────
   Seasonal-baseline refresh cycle — sibling to baselineCycle.ts, for
   the week-of-year WPSR norms (seasonal_baselines). 5-year bands
   don't meaningfully shift week to week, so this guards itself with
   a freshness check and skips the four EIA 5y-history fetches when
   the table was computed recently.

   Isolation posture matches every other cycle: never throw.
   SourceError failures are captured in the report; unknown throws
   are wrapped as bad_payload (adapter-bug catch-all).
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { fetchSeasonalBaselines } from "../sources/eiaSeasonal";
import { Queryable } from "../storage/db";
import { getSeasonalAgeDays, upsertSeasonalBaselines } from "../storage/seasonalRepo";

const DEFAULT_MAX_AGE_DAYS = 28;

export interface SeasonalCycleReport {
  startedAt: string;
  skipped?: string;
  written: number;
  error?: string;
}

export async function runSeasonalCycle(
  db: Queryable,
  opts: { now?: () => Date; maxAgeDays?: number } = {},
): Promise<SeasonalCycleReport> {
  const now = opts.now ?? (() => new Date());
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const startedAt = now().toISOString();

  try {
    const ageDays = await getSeasonalAgeDays(db);
    if (ageDays !== null && ageDays < maxAgeDays) {
      return { startedAt, skipped: `fresh (${ageDays}d old)`, written: 0 };
    }

    const rows = await fetchSeasonalBaselines(now());
    const written = await upsertSeasonalBaselines(db, rows);
    return { startedAt, written };
  } catch (e) {
    if (e instanceof SourceError) {
      return { startedAt, error: `${e.kind}: ${e.message}`, written: 0 };
    }
    const err = new SourceError("eia-seasonal", "bad_payload", String(e), { cause: e });
    return { startedAt, error: err.message, written: 0 };
  }
}
