/* ────────────────────────────────────────────────────────────────
   Repository for tape_snapshots — the composite headline stance. The
   score cycle upserts via upsertTapeSnapshot; /api/oil/tape reads the
   newest via getLatestTapeSnapshot. Mirrors macroRepo's shape.
──────────────────────────────────────────────────────────────── */

import { TapeSnapshot } from "../scores/engine";
import { Queryable } from "./db";

export interface TapeRow {
  runDate: string;
  stance: string;
  label: string;
  headline: string;
  drivers: { key: string; label: string; value: number | null }[];
  coverage: number;
  computedAt: string;
}

export async function upsertTapeSnapshot(db: Queryable, snap: TapeSnapshot): Promise<number> {
  const res = await db.query(
    `insert into tape_snapshots (run_date, stance, label, headline, drivers, coverage, computed_at)
     values ($1,$2,$3,$4,$5,$6, now())
     on conflict (run_date) do update
       set stance = excluded.stance,
           label = excluded.label,
           headline = excluded.headline,
           drivers = excluded.drivers,
           coverage = excluded.coverage,
           computed_at = now()`,
    [snap.runDate, snap.stance, snap.label, snap.headline, JSON.stringify(snap.drivers), snap.coverage.available],
  );
  return res.rowCount ?? 0;
}

export async function getLatestTapeSnapshot(db: Queryable): Promise<TapeRow | null> {
  const res = await db.query(`select * from tape_snapshots order by run_date desc limit 1`);
  const r = res.rows[0];
  if (!r) return null;
  return {
    runDate: toDateStr(r.run_date),
    stance: String(r.stance),
    label: String(r.label),
    headline: String(r.headline),
    drivers: Array.isArray(r.drivers) ? r.drivers : JSON.parse(String(r.drivers ?? "[]")),
    coverage: Number(r.coverage),
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
