/* ────────────────────────────────────────────────────────────────
   Repository for macro_snapshots — the only module that writes SQL for
   the macro layer. runMacroCycle calls upsertMacroSnapshot (regime +
   pressure computed together); the P·06 route and the Macro Override
   chip read via getLatestMacroSnapshot. Mirrors regimeRepo's shape.
──────────────────────────────────────────────────────────────── */

import { MacroPressureSnapshot, MacroRegimeSnapshot } from "../macro/types";
import { Queryable } from "./db";

export interface MacroSnapshotRow {
  runDate: string;
  quadrant: string;
  growthYoy: number | null;
  growthMomentum: number | null;
  inflationYoy: number | null;
  inflationMomentum: number | null;
  regimeHeadline: string;
  favored: string;
  regimeCoverage: number;
  pressureScore: number | null;
  pressureStatus: string;
  diverging: boolean;
  pressureHeadline: string;
  components: MacroPressureSnapshot["components"];
  computedAt: string;
}

/** Upsert the combined regime + pressure snapshot for a run_date. */
export async function upsertMacroSnapshot(
  db: Queryable,
  regime: MacroRegimeSnapshot,
  pressure: MacroPressureSnapshot,
): Promise<number> {
  const res = await db.query(
    `insert into macro_snapshots
       (run_date, quadrant, growth_yoy, growth_momentum, inflation_yoy, inflation_momentum,
        regime_headline, favored, regime_coverage,
        pressure_score, pressure_status, diverging, pressure_headline, components, computed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     on conflict (run_date) do update
       set quadrant = excluded.quadrant,
           growth_yoy = excluded.growth_yoy,
           growth_momentum = excluded.growth_momentum,
           inflation_yoy = excluded.inflation_yoy,
           inflation_momentum = excluded.inflation_momentum,
           regime_headline = excluded.regime_headline,
           favored = excluded.favored,
           regime_coverage = excluded.regime_coverage,
           pressure_score = excluded.pressure_score,
           pressure_status = excluded.pressure_status,
           diverging = excluded.diverging,
           pressure_headline = excluded.pressure_headline,
           components = excluded.components,
           computed_at = now()`,
    [
      regime.runDate,
      regime.quadrant,
      regime.growth.yoy,
      regime.growth.momentum,
      regime.inflation.yoy,
      regime.inflation.momentum,
      regime.headline,
      regime.favored,
      regime.coverage.available,
      pressure.score,
      pressure.status,
      pressure.diverging,
      pressure.headline,
      JSON.stringify(pressure.components),
    ],
  );
  return res.rowCount ?? 0;
}

/** Newest macro snapshot, or null when the table is empty. */
export async function getLatestMacroSnapshot(db: Queryable): Promise<MacroSnapshotRow | null> {
  const res = await db.query(
    `select * from macro_snapshots order by run_date desc limit 1`,
  );
  const r = res.rows[0];
  return r ? rowToMacro(r) : null;
}

function rowToMacro(r: Record<string, unknown>): MacroSnapshotRow {
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    runDate: toDateStr(r.run_date),
    quadrant: String(r.quadrant),
    growthYoy: num(r.growth_yoy),
    growthMomentum: num(r.growth_momentum),
    inflationYoy: num(r.inflation_yoy),
    inflationMomentum: num(r.inflation_momentum),
    regimeHeadline: String(r.regime_headline),
    favored: String(r.favored),
    regimeCoverage: Number(r.regime_coverage),
    pressureScore: num(r.pressure_score),
    pressureStatus: String(r.pressure_status),
    diverging: Boolean(r.diverging),
    pressureHeadline: String(r.pressure_headline),
    components: Array.isArray(r.components)
      ? (r.components as MacroPressureSnapshot["components"])
      : JSON.parse(String(r.components ?? "[]")),
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
