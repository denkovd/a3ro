/* ────────────────────────────────────────────────────────────────
   Repository layer for week-of-year seasonal baselines — sibling to
   baselineRepo.ts. The only module that writes SQL for
   seasonal_baselines. runSeasonalCycle calls upsertSeasonalBaselines;
   the score cycle reads via getSeasonalBaselines.
   getSeasonalAgeDays backs the cycle's freshness guard.
──────────────────────────────────────────────────────────────── */

import { SeasonalBaseline } from "../core/seasonalTypes";
import { Queryable } from "./db";

/** Upsert seasonal rows, keyed on (metric, iso_week). Returns rows written. */
export async function upsertSeasonalBaselines(
  db: Queryable,
  rows: SeasonalBaseline[],
): Promise<number> {
  let written = 0;
  for (const r of rows) {
    const res = await db.query(
      `insert into seasonal_baselines
         (metric, iso_week, mean_value, min_value, max_value, sample_count,
          sample_from, sample_to, computed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now())
       on conflict (metric, iso_week) do update
         set mean_value = excluded.mean_value,
             min_value = excluded.min_value,
             max_value = excluded.max_value,
             sample_count = excluded.sample_count,
             sample_from = excluded.sample_from,
             sample_to = excluded.sample_to,
             computed_at = now()`,
      [
        r.metric, r.isoWeek, r.meanValue, r.minValue, r.maxValue, r.sampleCount,
        r.sampleFrom, r.sampleTo,
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/** All seasonal rows — the score cycle filters by metric + week. */
export async function getSeasonalBaselines(db: Queryable): Promise<SeasonalBaseline[]> {
  const res = await db.query(`select * from seasonal_baselines`);
  return res.rows.map(rowToSeasonal);
}

/** Whole days since the newest computed_at, or null when empty. */
export async function getSeasonalAgeDays(db: Queryable): Promise<number | null> {
  const res = await db.query(`select max(computed_at) as newest from seasonal_baselines`);
  const newest = res.rows[0]?.newest;
  if (newest == null) return null;
  const newestMs = newest instanceof Date ? newest.getTime() : new Date(String(newest)).getTime();
  return Math.floor((Date.now() - newestMs) / 86_400_000);
}

/* ── row mapping helpers ──────────────────────────────────────── */

function rowToSeasonal(r: Record<string, unknown>): SeasonalBaseline {
  return {
    metric: String(r.metric),
    isoWeek: Number(r.iso_week),
    meanValue: Number(r.mean_value),
    minValue: Number(r.min_value),
    maxValue: Number(r.max_value),
    sampleCount: Number(r.sample_count),
    sampleFrom: toDateStr(r.sample_from),
    sampleTo: toDateStr(r.sample_to),
    computedAt: toIso(r.computed_at),
  };
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function toDateStr(v: unknown): string {
  // node-postgres parses `date` columns to a JS Date at LOCAL midnight,
  // so toISOString() would shift the day back for any TZ ahead of UTC.
  // Format from local components instead (same rule as every repo here).
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}
