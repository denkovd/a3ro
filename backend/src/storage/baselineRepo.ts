/* ────────────────────────────────────────────────────────────────
   Repository layer for corridor gate baselines — sibling to
   corridorRepo.ts. The only module that writes SQL for
   corridor_baselines. runBaselineCycle (ingest/baselineCycle.ts)
   calls upsertBaselines; REST handlers read via getBaselines.
   getBaselineAgeDays backs the cycle's freshness guard (skip refetch
   when the table was computed recently).

   The weekly-spread columns (migration 022) live on the same rows but
   are written by their own statements (updateWeeklySpreads) and read
   by their own guard (getWeeklySpreadAgeDays). upsertBaselines never
   names them, so the baseline refresh keeps working on a database
   where 022 has not been applied, and a baseline refresh never wipes
   a stored spread.
──────────────────────────────────────────────────────────────── */

import { BaselineWindow, CorridorBaseline, CorridorId, WeeklySpread } from "../core/corridorTypes";
import { parseWeeklySpread } from "../core/weeklySpread";
import { Queryable } from "./db";

/**
 * Upsert corridor baseline rows, keyed on (corridor, metric, win).
 * Returns rows written.
 */
export async function upsertBaselines(db: Queryable, rows: CorridorBaseline[]): Promise<number> {
  let written = 0;
  for (const r of rows) {
    const res = await db.query(
      `insert into corridor_baselines
         (corridor, metric, win, mean_value, p10, p90, yoy_pct,
          sample_from, sample_to, computed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       on conflict (corridor, metric, win) do update
         set mean_value = excluded.mean_value,
             p10 = excluded.p10,
             p90 = excluded.p90,
             yoy_pct = excluded.yoy_pct,
             sample_from = excluded.sample_from,
             sample_to = excluded.sample_to,
             computed_at = now()`,
      [
        r.corridor, r.metric, r.win, r.meanValue, r.p10, r.p90, r.yoyPct,
        r.sampleFrom, r.sampleTo,
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/** All baseline rows — what the API/frontend reads. */
export async function getBaselines(db: Queryable): Promise<CorridorBaseline[]> {
  const res = await db.query(`select * from corridor_baselines`);
  return res.rows.map(rowToBaseline);
}

/**
 * Whole days since the newest computed_at, or null when the table is
 * empty. Backs runBaselineCycle's freshness guard.
 */
export async function getBaselineAgeDays(db: Queryable): Promise<number | null> {
  const res = await db.query(`select max(computed_at) as newest from corridor_baselines`);
  const newest = res.rows[0]?.newest;
  if (newest == null) return null;
  const newestMs = newest instanceof Date ? newest.getTime() : new Date(String(newest)).getTime();
  const ageMs = Date.now() - newestMs;
  return Math.floor(ageMs / 86_400_000);
}

/**
 * Attach weekly spreads to existing (corridor, metric, win) baseline
 * rows. An UPDATE, not an upsert: a spread only means something next
 * to the mean it describes, so a key with no baseline row is skipped
 * (and not counted). Returns rows written. Requires migration 022.
 */
export async function updateWeeklySpreads(
  db: Queryable,
  rows: { corridor: CorridorId; metric: string; win: BaselineWindow; weekly: WeeklySpread }[],
): Promise<number> {
  let written = 0;
  for (const r of rows) {
    const res = await db.query(
      `update corridor_baselines
          set weekly = $4::jsonb,
              weekly_computed_at = now()
        where corridor = $1 and metric = $2 and win = $3`,
      [r.corridor, r.metric, r.win, JSON.stringify(r.weekly)],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/**
 * Whole days since the newest weekly spread was computed, or null when
 * none is stored. Throws when migration 022 has not been applied (the
 * column does not exist) — runGateSpreadCycle reports that, never hides it.
 */
export async function getWeeklySpreadAgeDays(db: Queryable): Promise<number | null> {
  const res = await db.query(`select max(weekly_computed_at) as newest from corridor_baselines`);
  const newest = res.rows[0]?.newest;
  if (newest == null) return null;
  const newestMs = newest instanceof Date ? newest.getTime() : new Date(String(newest)).getTime();
  return Math.floor((Date.now() - newestMs) / 86_400_000);
}

/* ── row mapping helpers ──────────────────────────────────────── */

function rowToBaseline(r: Record<string, unknown>): CorridorBaseline {
  // `weekly` is only set when the column exists AND holds a valid
  // spread, so rows read from a pre-022 database keep their old shape.
  const weekly = parseWeeklySpread(r.weekly);
  return {
    ...(weekly ? { weekly } : {}),
    corridor: r.corridor as CorridorId,
    metric: String(r.metric),
    win: r.win as "1y" | "5y",
    meanValue: Number(r.mean_value),
    p10: r.p10 == null ? null : Number(r.p10),
    p90: r.p90 == null ? null : Number(r.p90),
    yoyPct: r.yoy_pct == null ? null : Number(r.yoy_pct),
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
  // Format from local components instead (live-caught: "as of" dates
  // rendered one day early on a UTC+3 machine).
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}
