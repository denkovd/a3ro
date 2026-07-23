/* ────────────────────────────────────────────────────────────────
   btc_flow_metrics repository — stock/flow readings for BTC Tracker.
   Mirrors goldFlowRepo.ts shape-for-shape.
──────────────────────────────────────────────────────────────── */

import { Queryable } from "./db";
import type { BtcFlowMetricRow } from "../btc/flowTypes";

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

export interface BtcFlowMetricInput {
  locus: string;
  metric: string;
  periodDate: string;
  value: number;
  unit: string;
  source: string;
  meta?: Record<string, unknown>;
}

export async function upsertBtcFlowMetrics(
  db: Queryable,
  rows: BtcFlowMetricInput[],
): Promise<number> {
  let n = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.value)) continue;
    await db.query(
      `insert into btc_flow_metrics
         (locus, metric, period_date, value, unit, source, observed_at, meta)
       values ($1,$2,$3,$4,$5,$6, now(), $7::jsonb)
       on conflict (locus, metric, period_date) do update
         set value = excluded.value,
             unit = excluded.unit,
             source = excluded.source,
             observed_at = now(),
             meta = excluded.meta`,
      [
        r.locus,
        r.metric,
        r.periodDate,
        r.value,
        r.unit,
        r.source,
        JSON.stringify(r.meta ?? {}),
      ],
    );
    n++;
  }
  return n;
}

/** Latest row per (locus, metric). */
export async function getLatestBtcFlowMetrics(
  db: Queryable,
): Promise<BtcFlowMetricRow[]> {
  const res = await db.query(
    `select distinct on (locus, metric)
       locus, metric, period_date, value, unit, source, observed_at, meta
     from btc_flow_metrics
     order by locus, metric, period_date desc`,
  );
  return res.rows.map(mapRow);
}

export async function getBtcFlowMetricSeries(
  db: Queryable,
  locus: string,
  metric: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<BtcFlowMetricRow[]> {
  const limit = Math.min(opts.limit ?? 365, 2000);
  const params: unknown[] = [locus, metric];
  let sql = `select locus, metric, period_date, value, unit, source, observed_at, meta
     from btc_flow_metrics
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

function mapRow(r: Record<string, unknown>): BtcFlowMetricRow {
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
