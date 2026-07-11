/* ────────────────────────────────────────────────────────────────
   Repository layer for corridor metrics — sibling to priceRepo.ts.
   The only module that writes SQL for corridor_metrics. Ingestion
   calls insertCorridorMetrics; REST handlers read via
   getLatestCorridorMetrics.
──────────────────────────────────────────────────────────────── */

import { CorridorId, CorridorMetricLatest, CorridorMetricRecord } from "../core/corridorTypes";
import { Queryable } from "./db";

/**
 * Upsert normalized corridor metric records, keyed on
 * (corridor, metric, period_date). Returns rows written.
 */
export async function insertCorridorMetrics(
  db: Queryable,
  records: CorridorMetricRecord[],
): Promise<number> {
  let written = 0;
  for (const r of records) {
    const res = await db.query(
      `insert into corridor_metrics
         (corridor, metric, period_date, value, unit, source_id, confidence,
          observed_at, fetched_at, raw_value, raw_unit, meta, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       on conflict (corridor, metric, period_date) do update
         set value = excluded.value,
             unit = excluded.unit,
             source_id = excluded.source_id,
             confidence = excluded.confidence,
             observed_at = excluded.observed_at,
             fetched_at = excluded.fetched_at,
             raw_value = excluded.raw_value,
             raw_unit = excluded.raw_unit,
             meta = excluded.meta,
             updated_at = now()`,
      [
        r.corridor, r.metric, r.periodDate, r.value, r.unit, r.source, r.confidence,
        r.observedAt, r.fetchedAt, r.raw.value, r.raw.unit,
        r.meta ? JSON.stringify(r.meta) : null,
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/**
 * Historical values for one (corridor, metric), ascending by
 * period_date, bounded to [from, to] (YYYY-MM-DD, inclusive).
 * Backs the score cycle's leg computations (export-strength
 * percentile, stock-draw deltas) — corridor_metrics accumulates
 * history because rows are keyed on period_date and never deleted.
 */
export async function getCorridorMetricSeries(
  db: Queryable,
  corridor: CorridorId,
  metric: string,
  from: string,
  to: string,
): Promise<{ periodDate: string; value: number }[]> {
  const res = await db.query(
    `select period_date, value
       from corridor_metrics
      where corridor = $1 and metric = $2
        and period_date between $3 and $4
      order by period_date asc`,
    [corridor, metric, from, to],
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    periodDate: toDateStr(r.period_date),
    value: Number(r.value),
  }));
}

/** Newest row per (corridor, metric) — what the API/frontend reads. */
export async function getLatestCorridorMetrics(db: Queryable): Promise<CorridorMetricLatest[]> {
  const res = await db.query(
    `select distinct on (corridor, metric) *
       from corridor_metrics
      order by corridor, metric, period_date desc`,
  );
  return res.rows.map(rowToLatest);
}

/* ── row mapping helpers ──────────────────────────────────────── */

function rowToLatest(r: Record<string, unknown>): CorridorMetricLatest {
  return {
    corridor: r.corridor as CorridorId,
    metric: String(r.metric),
    value: Number(r.value),
    unit: String(r.unit),
    periodDate: toDateStr(r.period_date),
    source: String(r.source_id),
    observedAt: toIso(r.observed_at),
    updatedAt: toIso(r.updated_at),
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
