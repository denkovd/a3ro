/* ────────────────────────────────────────────────────────────────
   Baseline refresh cycle — sibling to corridorPipeline.ts, but for
   the (much lower-cadence) gate-baseline domain. 1y/5y historical
   norms don't meaningfully shift day to day, so this cycle guards
   itself with a freshness check (getBaselineAgeDays) and skips the
   three-query PortWatch statistics fetch entirely when the table was
   computed recently — unlike runCorridorCycle, which always polls.

   Isolation posture matches every other cycle in this codebase: never
   throw. SourceError failures are captured in the report; unknown
   throws are wrapped as bad_payload the same way corridorPipeline.ts
   does (adapter-bug catch-all, not a real source classification).
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { fetchGateBaselines } from "../sources/portwatchBaselines";
import { Queryable } from "../storage/db";
import { getBaselineAgeDays, upsertBaselines } from "../storage/baselineRepo";

const DEFAULT_MAX_AGE_DAYS = 28;

export interface BaselineCycleReport {
  startedAt: string;
  skipped?: string;
  written: number;
  error?: string;
}

export async function runBaselineCycle(
  db: Queryable,
  opts: { now?: () => Date; maxAgeDays?: number } = {},
): Promise<BaselineCycleReport> {
  const now = opts.now ?? (() => new Date());
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const startedAt = now().toISOString();

  try {
    const ageDays = await getBaselineAgeDays(db);
    if (ageDays !== null && ageDays < maxAgeDays) {
      return { startedAt, skipped: `fresh (${ageDays}d old)`, written: 0 };
    }

    const rows = await fetchGateBaselines(now());
    const written = await upsertBaselines(db, rows);
    return { startedAt, written };
  } catch (e) {
    if (e instanceof SourceError) {
      return { startedAt, error: `${e.kind}: ${e.message}`, written: 0 };
    }
    // Unknown throw = adapter bug. Wrap it the same way corridorPipeline.ts does.
    const err = new SourceError("portwatch-baselines", "bad_payload", String(e), { cause: e });
    return { startedAt, error: err.message, written: 0 };
  }
}
