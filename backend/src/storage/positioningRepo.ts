/* ────────────────────────────────────────────────────────────────
   Repository for cot_positioning — the only module that writes SQL for
   Macro Override's positioning half. runPositioningCycle upserts the
   latest COT read; the macro route reads the newest via
   getLatestPositioning. Mirrors macroRepo's shape.
──────────────────────────────────────────────────────────────── */

import { PositioningSnapshot } from "../macro/types";
import { Queryable } from "./db";

export interface PositioningRow {
  reportDate: string;
  market: string;
  mmLong: number;
  mmShort: number;
  netLength: number;
  percentile1y: number | null;
  stance: string;
  computedAt: string;
}

/** Upsert one COT report_date. No-op-safe when the snapshot is still
 *  building history (netLength null) — nothing to persist yet. */
export async function upsertPositioning(db: Queryable, snap: PositioningSnapshot): Promise<number> {
  if (snap.reportDate === null || snap.netLength === null || snap.longs === null || snap.shorts === null) {
    return 0;
  }
  const res = await db.query(
    `insert into cot_positioning
       (report_date, market, mm_long, mm_short, net_length, percentile_1y, stance, computed_at)
     values ($1,$2,$3,$4,$5,$6,$7, now())
     on conflict (report_date) do update
       set market = excluded.market,
           mm_long = excluded.mm_long,
           mm_short = excluded.mm_short,
           net_length = excluded.net_length,
           percentile_1y = excluded.percentile_1y,
           stance = excluded.stance,
           computed_at = now()`,
    [snap.reportDate, snap.market, snap.longs, snap.shorts, snap.netLength, snap.percentile1y, snap.stance],
  );
  return res.rowCount ?? 0;
}

/** Newest positioning row, or null when the table is empty. */
export async function getLatestPositioning(db: Queryable): Promise<PositioningRow | null> {
  const res = await db.query(`select * from cot_positioning order by report_date desc limit 1`);
  const r = res.rows[0];
  if (!r) return null;
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    reportDate: toDateStr(r.report_date),
    market: String(r.market),
    mmLong: Number(r.mm_long),
    mmShort: Number(r.mm_short),
    netLength: Number(r.net_length),
    percentile1y: num(r.percentile_1y),
    stance: String(r.stance),
    computedAt: r.computed_at instanceof Date ? r.computed_at.toISOString() : new Date(String(r.computed_at)).toISOString(),
  };
}

function toDateStr(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}
