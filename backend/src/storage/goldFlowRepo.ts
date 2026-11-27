/* ────────────────────────────────────────────────────────────────
   gold_flow_metrics repository — stock/flow readings for Gold Tracker.
──────────────────────────────────────────────────────────────── */

import { Queryable } from "./db";
import type { GoldFlowMetricRow } from "../gold/flowTypes";

function toDateStr(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}
function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

export interface GoldFlowMetricInput {
  locus: string;
  metric: string;
  periodDate: string;
  value: number;
  unit: string;
  source: string;
  meta?: Record<string, unknown>;
}

const UPSERT_CHUNK = 500;

/**
 * Set-based upsert: one round trip per 500 rows. The WGC step writes the full weekly ETF history
 * (~4,000 rows) every day, and the old one-query-per-row loop held the ingest cron's goldFlow step
 * past its 90 s cap (26 Nov 2026). Returns the number of finite rows given.
 */
export async function upsertGoldFlowMetrics(
  db: Queryable,
  rows: GoldFlowMetricInput[],
): Promise<number> {
  const finite = rows.filter((r) => Number.isFinite(r.value));
  // One statement cannot update the same key twice; keep the last row per key, as the per-row loop did.
  const unique = [...new Map(finite.map((r) => [`${r.locus}\u0000${r.metric}\u0000${r.periodDate}`, r])).values()];
  for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
    const chunk = unique.slice(i, i + UPSERT_CHUNK);
    await db.query(
      `insert into gold_flow_metrics
         (locus, metric, period_date, value, unit, source, observed_at, meta)
       select locus, metric, period_date, value, unit, source, now(), meta::jsonb
       from unnest($1::text[], $2::text[], $3::date[], $4::double precision[], $5::text[], $6::text[], $7::text[])
         as t(locus, metric, period_date, value, unit, source, meta)
       on conflict (locus, metric, period_date) do update
         set value = excluded.value,
             unit = excluded.unit,
             source = excluded.source,
             observed_at = now(),
             meta = excluded.meta`,
      [
        chunk.map((r) => r.locus),
        chunk.map((r) => r.metric),
        chunk.map((r) => r.periodDate),
        chunk.map((r) => r.value),
        chunk.map((r) => r.unit),
        chunk.map((r) => r.source),
        chunk.map((r) => JSON.stringify(r.meta ?? {})),
      ],
    );
  }
  return finite.length;
}

/** Latest row per (locus, metric). */
export async function getLatestGoldFlowMetrics(
  db: Queryable,
): Promise<GoldFlowMetricRow[]> {
  const res = await db.query(
    `select distinct on (locus, metric)
       locus, metric, period_date, value, unit, source, observed_at, meta
     from gold_flow_metrics
     order by locus, metric, period_date desc`,
  );
  return res.rows.map(mapRow);
}

export async function getGoldFlowMetricSeries(
  db: Queryable,
  locus: string,
  metric: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<GoldFlowMetricRow[]> {
  const limit = Math.min(opts.limit ?? 365, 2000);
  const params: unknown[] = [locus, metric];
  let sql = `select locus, metric, period_date, value, unit, source, observed_at, meta
     from gold_flow_metrics
     where locus = $1 and metric = $2`;
  if (opts.from) {
    params.push(opts.from);
    sql += ` and period_date >= $${params.length}`;
  }
  if (opts.to) {
    params.push(opts.to);
    sql += ` and period_date <= $${params.length}`;
  }
  sql += ` order by period_date asc limit ${limit}`;
  const res = await db.query(sql, params);
  return res.rows.map(mapRow);
}

function mapRow(r: Record<string, unknown>): GoldFlowMetricRow {
  const meta = r.meta;
  return {
    locus: String(r.locus),
    metric: String(r.metric),
    periodDate: toDateStr(r.period_date),
    value: Number(r.value),
    unit: String(r.unit),
    source: String(r.source),
    observedAt: toIso(r.observed_at),
    meta:
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {},
  };
}
