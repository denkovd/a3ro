/* ────────────────────────────────────────────────────────────────
   Repository layer for corridor metrics — sibling to priceRepo.ts.
   The only module that writes SQL for corridor_metrics. Ingestion
   calls insertCorridorMetrics; REST handlers read via
   getLatestCorridorMetrics.
──────────────────────────────────────────────────────────────── */

import { CorridorId, CorridorMetricLatest, CorridorMetricRecord } from "../core/corridorTypes";
import { Queryable } from "./db";

const UPSERT_CHUNK = 500;

/**
 * Upsert normalized corridor metric records, keyed on
 * (corridor, metric, period_date). Returns rows written.
 * Set-based: one round trip per 500 records rather than one per record, since the
 * cron region is far from the database.
 */
export async function insertCorridorMetrics(
  db: Queryable,
  records: CorridorMetricRecord[],
): Promise<number> {
  // One statement cannot update the same key twice; keep the last record per key, as the per-row loop did.
  const unique = [...new Map(records.map((r) => [`${r.corridor}\u0000${r.metric}\u0000${r.periodDate}`, r])).values()];
  let written = 0;
  for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
    const chunk = unique.slice(i, i + UPSERT_CHUNK);
    const res = await db.query(
      `insert into corridor_metrics
         (corridor, metric, period_date, value, unit, source_id, confidence,
          observed_at, fetched_at, raw_value, raw_unit, meta, updated_at)
       select corridor, metric, period_date, value, unit, source_id, confidence,
              observed_at, fetched_at, raw_value, raw_unit, meta::jsonb, now()
       from unnest($1::text[], $2::text[], $3::date[], $4::double precision[], $5::text[], $6::text[], $7::text[],
                   $8::timestamptz[], $9::timestamptz[], $10::double precision[], $11::text[], $12::text[])
         as t(corridor, metric, period_date, value, unit, source_id, confidence,
              observed_at, fetched_at, raw_value, raw_unit, meta)
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
        chunk.map((r) => r.corridor), chunk.map((r) => r.metric), chunk.map((r) => r.periodDate),
        chunk.map((r) => r.value), chunk.map((r) => r.unit), chunk.map((r) => r.source),
        chunk.map((r) => r.confidence), chunk.map((r) => r.observedAt), chunk.map((r) => r.fetchedAt),
        chunk.map((r) => r.raw.value), chunk.map((r) => r.raw.unit),
        chunk.map((r) => (r.meta ? JSON.stringify(r.meta) : null)),
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
): Promise<{ periodDate: string; value: number; periodStart?: string }[]> {
  const res = await db.query(
    `select period_date, value, meta
       from corridor_metrics
      where corridor = $1 and metric = $2
        and period_date between $3 and $4
      order by period_date asc`,
    [corridor, metric, from, to],
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    periodDate: toDateStr(r.period_date),
    value: Number(r.value),
    ...(corridor === "china" && typeof (r.meta as Record<string, unknown> | null)?.periodStart === "string" ? { periodStart: String((r.meta as Record<string, unknown>).periodStart) } : {}),
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
    ...(r.corridor === "china" ? { meta: publicChinaMeta(r.meta) } : {}),
  };
}

function publicChinaMeta(meta: unknown): Record<string, string> {
  if (!meta || typeof meta !== "object") return {};
  const allowed = ["sourceUrl", "periodStart", "periodEnd", "publishedDate", "cadence", "dailyKt", "yoyPct", "yoyBasis", "preliminary"];
  return Object.fromEntries(Object.entries(meta).filter(([key, value]) => allowed.includes(key) && typeof value === "string")) as Record<string, string>;
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
