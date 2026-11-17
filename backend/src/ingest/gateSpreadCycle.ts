/* ────────────────────────────────────────────────────────────────
   Gate weekly-spread refresh cycle — sibling to baselineCycle.ts and
   deliberately separate from it: the spread needs a much heavier
   fetch (five years of daily rows) and a column the baseline refresh
   does not depend on, so neither can fail the other. Run it AFTER
   runBaselineCycle — it attaches spreads to baseline rows that
   already exist.

   Self-guarding like the baseline cycle: skips the PortWatch fetch
   when the stored spreads were computed inside maxAgeDays, so most
   cron runs cost one cheap read. It also heals itself: on the first
   run after migration 022 nothing is stored, so it fetches straight
   away instead of waiting for the next baseline refresh.

   Isolation posture matches every other cycle: never throw. A missing
   column (022 not applied) is reported in plain words rather than as
   an anonymous adapter failure.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { fetchGateWeeklySpreads } from "../sources/portwatchWeekly";
import { Queryable } from "../storage/db";
import { getWeeklySpreadAgeDays, updateWeeklySpreads } from "../storage/baselineRepo";

const DEFAULT_MAX_AGE_DAYS = 28;

export interface GateSpreadCycleReport {
  startedAt: string;
  skipped?: string;
  /** Spreads computed from the fetch (gate × metric × window). */
  computed: number;
  /** Baseline rows a spread was attached to. */
  written: number;
  error?: string;
}

export async function runGateSpreadCycle(
  db: Queryable,
  opts: { now?: () => Date; maxAgeDays?: number } = {},
): Promise<GateSpreadCycleReport> {
  const now = opts.now ?? (() => new Date());
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const startedAt = now().toISOString();

  try {
    const ageDays = await getWeeklySpreadAgeDays(db);
    if (ageDays !== null && ageDays < maxAgeDays) {
      return { startedAt, skipped: `fresh (${ageDays}d old)`, computed: 0, written: 0 };
    }

    const rows = await fetchGateWeeklySpreads(now());
    const written = await updateWeeklySpreads(db, rows);
    return { startedAt, computed: rows.length, written };
  } catch (e) {
    if (e instanceof SourceError) {
      return { startedAt, error: `${e.kind}: ${e.message}`, computed: 0, written: 0 };
    }
    const text = e instanceof Error ? e.message : String(e);
    if (/weekly(_computed_at)?/i.test(text) && /does not exist/i.test(text)) {
      return {
        startedAt,
        error: `migration 022_gate_weekly_spread.sql not applied: ${text}`,
        computed: 0,
        written: 0,
      };
    }
    // Unknown throw = adapter bug. Wrap it the same way baselineCycle.ts does.
    const err = new SourceError("portwatch-weekly", "bad_payload", String(e), { cause: e });
    return { startedAt, error: err.message, computed: 0, written: 0 };
  }
}
