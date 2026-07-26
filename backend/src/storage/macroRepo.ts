/* ────────────────────────────────────────────────────────────────
   Repository for macro_snapshots — the only module that writes SQL for
   the macro layer. runMacroCycle calls upsertMacroSnapshot (regime +
   pressure computed together); the P·06 route and the Macro Override
   chip read via getLatestMacroSnapshot. Mirrors regimeRepo's shape.
──────────────────────────────────────────────────────────────── */

import {
  LiquidityStressSnapshot,
  MacroPressureSnapshot,
  MacroRegimeSnapshot,
  NominalGrowthSnapshot,
  SixCyclesSnapshot,
} from "../macro/types";
import { GlobalBondRead } from "../macro/globalBonds";
import { RiskMatrixSnapshot } from "../macro/vams";
import { Allocation } from "../macro/allocation";
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

  /* ── liquidity / cost-of-capital layer (019_macro_liquidity.sql) ──
     Optional on the type because a row written before that migration
     ran has no values for them — readers must treat them as absent,
     not as zero. */
  liquidityScore: number | null;
  liquidityStatus: string;
  riskPremiumAlert: boolean;
  liquidityHeadline: string;
  liquidityLegs: LiquidityStressSnapshot["legs"];
  liquidityCoverage: number;
  nominalGdpYoy: number | null;
  nominalTrend0307: number | null;
  nominalTrend1519: number | null;
  nominalGap: number | null;
  nominalAsOf: string | null;
  globalBonds: GlobalBondRead | null;

  /* ── top-down layer: the regime the MARKET is pricing (VAMS) ──
     Deliberately parallel to `quadrant` above, never merged with it. */
  marketRegime: string;
  marketShares: RiskMatrixSnapshot["shares"] | Record<string, never>;
  marketRiskOn: number | null;
  marketScored: number;
  marketUniverse: number;
  marketHeadline: string;
  vamsReads: RiskMatrixSnapshot["reads"];

  /* ── the six cycles ── */
  cycles: SixCyclesSnapshot["cycles"];
  cyclesTailwinds: number;
  cyclesHeadwinds: number;
  cyclesHeadline: string;

  /* ── KISS allocation target (020_macro_allocation.sql) ── */
  allocationRegime: string | null;
  allocationRegimeSource: string;
  allocationInvested: number | null;
  allocationCash: number | null;
  allocationWeights: Allocation["weights"];
}

/** Upsert the combined regime + pressure + liquidity snapshot for a
 *  run_date. All of it comes from one FRED fetch in one cycle, so it
 *  is one row and one write. */
export async function upsertMacroSnapshot(
  db: Queryable,
  regime: MacroRegimeSnapshot,
  pressure: MacroPressureSnapshot,
  liquidity?: LiquidityStressSnapshot,
  nominal?: NominalGrowthSnapshot,
  globalBonds?: GlobalBondRead | null,
  matrix?: RiskMatrixSnapshot,
  sixCycles?: SixCyclesSnapshot,
  allocation?: Allocation,
): Promise<number> {
  const res = await db.query(
    `insert into macro_snapshots
       (run_date, quadrant, growth_yoy, growth_momentum, inflation_yoy, inflation_momentum,
        regime_headline, favored, regime_coverage,
        pressure_score, pressure_status, diverging, pressure_headline, components,
        liquidity_score, liquidity_status, risk_premium_alert, liquidity_headline,
        liquidity_legs, liquidity_coverage,
        nominal_gdp_yoy, nominal_trend_0307, nominal_trend_1519, nominal_gap, nominal_as_of,
        global_bonds,
        market_regime, market_shares, market_risk_on, market_scored, market_universe,
        market_headline, vams_reads,
        cycles, cycles_tailwinds, cycles_headwinds, cycles_headline,
        allocation_regime, allocation_regime_source, allocation_invested,
        allocation_cash, allocation_weights,
        computed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
             $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
             $27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,
             $38,$39,$40,$41,$42, now())
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
           liquidity_score = excluded.liquidity_score,
           liquidity_status = excluded.liquidity_status,
           risk_premium_alert = excluded.risk_premium_alert,
           liquidity_headline = excluded.liquidity_headline,
           liquidity_legs = excluded.liquidity_legs,
           liquidity_coverage = excluded.liquidity_coverage,
           nominal_gdp_yoy = excluded.nominal_gdp_yoy,
           nominal_trend_0307 = excluded.nominal_trend_0307,
           nominal_trend_1519 = excluded.nominal_trend_1519,
           nominal_gap = excluded.nominal_gap,
           nominal_as_of = excluded.nominal_as_of,
           global_bonds = excluded.global_bonds,
           market_regime = excluded.market_regime,
           market_shares = excluded.market_shares,
           market_risk_on = excluded.market_risk_on,
           market_scored = excluded.market_scored,
           market_universe = excluded.market_universe,
           market_headline = excluded.market_headline,
           vams_reads = excluded.vams_reads,
           cycles = excluded.cycles,
           cycles_tailwinds = excluded.cycles_tailwinds,
           cycles_headwinds = excluded.cycles_headwinds,
           cycles_headline = excluded.cycles_headline,
           allocation_regime = excluded.allocation_regime,
           allocation_regime_source = excluded.allocation_regime_source,
           allocation_invested = excluded.allocation_invested,
           allocation_cash = excluded.allocation_cash,
           allocation_weights = excluded.allocation_weights,
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
      liquidity?.score ?? null,
      liquidity?.status ?? "insufficient",
      liquidity?.riskPremiumAlert ?? false,
      liquidity?.headline ?? "",
      JSON.stringify(liquidity?.legs ?? []),
      liquidity?.coverage.available ?? 0,
      nominal?.yoy ?? null,
      nominal?.trend0307 ?? null,
      nominal?.trend1519 ?? null,
      nominal?.gapToRecentTrend ?? null,
      nominal?.asOf ?? null,
      globalBonds ? JSON.stringify(globalBonds) : null,
      matrix?.modalRegime ?? "PENDING",
      JSON.stringify(matrix?.shares ?? {}),
      matrix?.riskOnShare ?? null,
      matrix?.scored ?? 0,
      matrix?.universe ?? 0,
      matrix?.headline ?? "",
      JSON.stringify(matrix?.reads ?? []),
      JSON.stringify(sixCycles?.cycles ?? []),
      sixCycles?.tailwinds ?? 0,
      sixCycles?.headwinds ?? 0,
      sixCycles?.headline ?? "",
      allocation?.regime ?? null,
      allocation?.regimeSource ?? "none",
      allocation?.invested ?? null,
      allocation?.cash ?? null,
      JSON.stringify(allocation?.weights ?? []),
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

/** jsonb comes back parsed from `pg`, but a text column holding JSON
 *  does not — tolerate both, and never throw on malformed content. */
function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
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

    liquidityScore: num(r.liquidity_score),
    liquidityStatus: r.liquidity_status == null ? "insufficient" : String(r.liquidity_status),
    riskPremiumAlert: Boolean(r.risk_premium_alert),
    liquidityHeadline: r.liquidity_headline == null ? "" : String(r.liquidity_headline),
    liquidityLegs: parseJson<MacroSnapshotRow["liquidityLegs"]>(r.liquidity_legs, []),
    liquidityCoverage: r.liquidity_coverage == null ? 0 : Number(r.liquidity_coverage),
    nominalGdpYoy: num(r.nominal_gdp_yoy),
    nominalTrend0307: num(r.nominal_trend_0307),
    nominalTrend1519: num(r.nominal_trend_1519),
    nominalGap: num(r.nominal_gap),
    nominalAsOf: r.nominal_as_of == null ? null : toDateStr(r.nominal_as_of),
    globalBonds: parseJson<MacroSnapshotRow["globalBonds"]>(r.global_bonds, null),

    marketRegime: r.market_regime == null ? "PENDING" : String(r.market_regime),
    marketShares: parseJson<MacroSnapshotRow["marketShares"]>(r.market_shares, {}),
    marketRiskOn: num(r.market_risk_on),
    marketScored: r.market_scored == null ? 0 : Number(r.market_scored),
    marketUniverse: r.market_universe == null ? 0 : Number(r.market_universe),
    marketHeadline: r.market_headline == null ? "" : String(r.market_headline),
    vamsReads: parseJson<MacroSnapshotRow["vamsReads"]>(r.vams_reads, []),

    cycles: parseJson<MacroSnapshotRow["cycles"]>(r.cycles, []),
    cyclesTailwinds: r.cycles_tailwinds == null ? 0 : Number(r.cycles_tailwinds),
    cyclesHeadwinds: r.cycles_headwinds == null ? 0 : Number(r.cycles_headwinds),
    cyclesHeadline: r.cycles_headline == null ? "" : String(r.cycles_headline),

    allocationRegime: r.allocation_regime == null ? null : String(r.allocation_regime),
    allocationRegimeSource:
      r.allocation_regime_source == null ? "none" : String(r.allocation_regime_source),
    allocationInvested: num(r.allocation_invested),
    allocationCash: num(r.allocation_cash),
    allocationWeights: parseJson<MacroSnapshotRow["allocationWeights"]>(r.allocation_weights, []),
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
