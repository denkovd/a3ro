/* ────────────────────────────────────────────────────────────────
   Deriving REGIME_AFFINITY from data instead of judgement.

   vams.ts ships a hand-written affinity table — which GRID regimes a
   market's trend state confirms. It was reasoned from standard
   cross-asset logic and documented per line, but Dale derives his
   playbooks from ~25 years of per-asset regime statistics, and
   "reasoned" is a weaker claim than "measured". This module measures.

   THE QUESTION being answered is conditional, not directional: given
   that asset X is currently BULLISH, which regimes is that state
   evidence for? So the statistic is LIFT —

       lift(regime | state) = P(regime | state) / P(regime)

   — how much more often that regime holds when the asset is in that
   state, versus its unconditional base rate. Lift > 1 means the state
   carries information about the regime; lift ≈ 1 means it carries
   none, however good the asset's returns happen to be in that regime.

   Using raw returns instead would answer a different question ("where
   does this asset make money"), which is the portfolio-construction
   question, not the regime-confirmation question the matrix asks.

   METHOD
   1. Label history: walk INDPRO/CPI forward, and at each step run the
      same computeMacroRegime the live page uses, truncated to data
      available at that date. Same function, so the labels can never
      drift from the live quadrant definition.
   2. For each label date, compute the asset's VAMS state from bars up
      to that date only.
   3. Cross-tabulate, compute lift, and confirm the regimes that clear
      both a lift floor and a minimum cell count.

   KNOWN BIAS, stated because it changes how much to trust the output:
   FRED revises INDPRO and CPI, and this labels history with the
   revised series, not what was known at the time. So the labels are
   slightly better than a contemporaneous observer would have had.
   That is the standard convention for regime backtests (the regime is
   treated as ground truth, not as a forecast) and it does not
   advantage any one asset over another, which is what matters for a
   relative measure like lift. It would matter if these were tradeable
   backtest returns. They are not.

   Pure, no IO — the script feeds it.
──────────────────────────────────────────────────────────────── */

import { MacroObservation } from "../sources/fredMacro";
import { RegimeBar } from "../regime/types";
import { computeMacroRegime } from "./engine";
import { MacroQuadrant } from "./types";
import { computeVams, VamsState, VAMS_WINDOW } from "./vams";

export type Quadrant = Exclude<MacroQuadrant, "PENDING">;
const QUADRANTS: Quadrant[] = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"];

/* ── thresholds — named, documented, and reported alongside every
   result so a reader can disagree with them without reading code ── */

/** Months a (state, regime) pair must be observed before it counts.
 *  Below this a single unusual quarter can invent an affinity. */
export const MIN_CELL = 6;
/** Lift a regime must clear to be treated as confirmed. 1.15 = the
 *  regime is at least 15% more likely under this state than at base
 *  rate. Deliberately modest: the matrix splits a market's point
 *  across whatever it confirms, so a slightly-too-generous threshold
 *  dilutes rather than distorts. */
export const MIN_LIFT = 1.15;
/** Labelled months an asset needs before its table is used at all.
 *  Roughly five years — below that an asset has not lived through
 *  enough distinct regimes for the conditional to mean anything. */
export const MIN_SAMPLES = 60;
/** Cap on regimes confirmed per state. Dale's own mappings are one or
 *  two; allowing three or four would make a market's single point so
 *  finely split it stops discriminating. */
export const MAX_CONFIRMS = 2;

export interface RegimeLabel {
  date: string;
  quadrant: Quadrant;
}

/**
 * Regime label per step, computed with the LIVE engine on truncated
 * history so a label can never disagree with what the page would have
 * shown on that date.
 *
 * `stepDays` walks monthly by default — INDPRO and CPI are monthly, so
 * a finer step would just repeat labels and inflate sample counts with
 * duplicates, which would silently shrink the effective significance
 * of every cell.
 */
export function buildRegimeTimeline(
  growthObs: MacroObservation[],
  inflationObs: MacroObservation[],
  opts: { stepDays?: number; from?: string } = {},
): RegimeLabel[] {
  const step = opts.stepDays ?? 30;
  if (growthObs.length === 0 || inflationObs.length === 0) return [];

  const first = growthObs[0].date < inflationObs[0].date ? inflationObs[0].date : growthObs[0].date;
  const lastG = growthObs[growthObs.length - 1].date;
  const lastI = inflationObs[inflationObs.length - 1].date;
  const last = lastG < lastI ? lastG : lastI;

  // 2 years of warm-up: the engine needs a YoY plus a 120-day momentum
  // lookback before it will return anything but PENDING.
  const startMs = new Date(`${opts.from ?? first}T00:00:00Z`).getTime() + 730 * 86_400_000;
  const endMs = new Date(`${last}T00:00:00Z`).getTime();

  const out: RegimeLabel[] = [];
  for (let ms = startMs; ms <= endMs; ms += step * 86_400_000) {
    const asOf = new Date(ms).toISOString().slice(0, 10);
    const g = growthObs.filter((o) => o.date <= asOf);
    const i = inflationObs.filter((o) => o.date <= asOf);
    const snap = computeMacroRegime(g, i, asOf);
    if (snap.quadrant === "PENDING") continue;
    out.push({ date: asOf, quadrant: snap.quadrant as Quadrant });
  }
  return out;
}

export interface RegimeStat {
  quadrant: Quadrant;
  /** Months this regime held while the asset was in this state. */
  n: number;
  /** P(regime | state) / P(regime). */
  lift: number;
}

export interface AffinityEvidence {
  symbol: string;
  /** Labelled months where the asset had a BULLISH or BEARISH state. */
  samples: number;
  bullishN: number;
  bearishN: number;
  bullish: RegimeStat[];
  bearish: RegimeStat[];
  /** The derived table — regimes clearing MIN_LIFT and MIN_CELL. */
  derived: { bullish: Quadrant[]; bearish: Quadrant[] };
  /** False when the asset has too little history to trust; the caller
   *  should fall back to the hand-written entry rather than adopt a
   *  table built from a handful of months. */
  sufficient: boolean;
  /** Earliest and latest labelled month actually used. */
  from: string | null;
  to: string | null;
}

function statsFor(
  counts: Record<Quadrant, number>,
  stateTotal: number,
  baseRate: Record<Quadrant, number>,
): RegimeStat[] {
  const out: RegimeStat[] = [];
  for (const q of QUADRANTS) {
    const n = counts[q];
    if (stateTotal === 0 || baseRate[q] === 0) continue;
    const conditional = n / stateTotal;
    out.push({ quadrant: q, n, lift: Math.round((conditional / baseRate[q]) * 1000) / 1000 });
  }
  return out.sort((a, b) => b.lift - a.lift);
}

function confirmedFrom(stats: RegimeStat[]): Quadrant[] {
  return stats
    .filter((s) => s.lift >= MIN_LIFT && s.n >= MIN_CELL)
    .slice(0, MAX_CONFIRMS)
    .map((s) => s.quadrant);
}

/**
 * Cross-tabulate one asset's VAMS state against the regime timeline.
 *
 * Walks the timeline with a cursor into the (sorted) bar array rather
 * than re-slicing the whole history per label — 30 assets × ~250
 * labels × thousands of bars is enough work to matter in a script.
 */
export function deriveAffinity(
  bars: RegimeBar[],
  timeline: RegimeLabel[],
  symbol: string,
): AffinityEvidence {
  const zero = (): Record<Quadrant, number> => ({
    GOLDILOCKS: 0, REFLATION: 0, INFLATION: 0, DEFLATION: 0,
  });
  const bullCounts = zero();
  const bearCounts = zero();
  const baseCounts = zero();

  let bullishN = 0;
  let bearishN = 0;
  let total = 0;
  let from: string | null = null;
  let to: string | null = null;

  let cursor = 0;
  for (const label of timeline) {
    while (cursor < bars.length && bars[cursor].date <= label.date) cursor++;
    // cursor is now one past the last bar on or before the label date
    if (cursor < VAMS_WINDOW + 1) continue;

    const state: VamsState = computeVams(bars.slice(0, cursor), symbol, symbol).state;
    if (state !== "BULLISH" && state !== "BEARISH") continue;

    // Base rate is computed over the SAME months the asset was scored
    // in, not over the whole timeline. Otherwise an asset that only
    // exists post-2017 gets compared against a base rate that includes
    // 2008 — and every crypto asset would show a spurious affinity.
    baseCounts[label.quadrant]++;
    total++;
    if (from === null) from = label.date;
    to = label.date;

    if (state === "BULLISH") {
      bullCounts[label.quadrant]++;
      bullishN++;
    } else {
      bearCounts[label.quadrant]++;
      bearishN++;
    }
  }

  const baseRate = { GOLDILOCKS: 0, REFLATION: 0, INFLATION: 0, DEFLATION: 0 } as Record<Quadrant, number>;
  for (const q of QUADRANTS) baseRate[q] = total === 0 ? 0 : baseCounts[q] / total;

  const bullish = statsFor(bullCounts, bullishN, baseRate);
  const bearish = statsFor(bearCounts, bearishN, baseRate);
  const sufficient = total >= MIN_SAMPLES;

  return {
    symbol,
    samples: total,
    bullishN,
    bearishN,
    bullish,
    bearish,
    derived: {
      bullish: sufficient ? confirmedFrom(bullish) : [],
      bearish: sufficient ? confirmedFrom(bearish) : [],
    },
    sufficient,
    from,
    to,
  };
}

/** Emit the generated affinity module. Evidence is written alongside
 *  the table so the numbers behind every line are reviewable in the
 *  diff — a generated file nobody can audit is worse than a
 *  hand-written one somebody argued about. */
export function renderAffinityModule(
  evidence: AffinityEvidence[],
  meta: { generatedAt: string; timelineFrom: string; timelineTo: string; labels: number },
): string {
  const usable = evidence.filter((e) => e.sufficient);
  const lines: string[] = [];

  lines.push("/* ────────────────────────────────────────────────────────────────");
  lines.push("   GENERATED — do not edit by hand.");
  lines.push("   Regenerate: npm run backtest:affinity");
  lines.push("");
  lines.push(`   Generated:      ${meta.generatedAt}`);
  lines.push(`   Regime labels:  ${meta.labels} (${meta.timelineFrom} → ${meta.timelineTo})`);
  lines.push(`   Assets derived: ${usable.length}/${evidence.length}`);
  lines.push("");
  lines.push("   Each entry lists the regimes whose conditional probability under");
  lines.push(`   that state clears lift ≥ ${MIN_LIFT} with n ≥ ${MIN_CELL} months.`);
  lines.push("   Assets below the sample floor are omitted and fall back to the");
  lines.push("   hand-written table in vams.ts.");
  lines.push("");
  lines.push("   See macro/affinityBacktest.ts for the method and its known bias.");
  lines.push("──────────────────────────────────────────────────────────────── */");
  lines.push("");
  lines.push('import { MacroQuadrant } from "./types";');
  lines.push("");
  lines.push("type Q = Exclude<MacroQuadrant, \"PENDING\">;");
  lines.push("");
  lines.push("export const AFFINITY_GENERATED_AT: string | null = " + JSON.stringify(meta.generatedAt) + ";");
  lines.push("");
  lines.push("export const REGIME_AFFINITY_DERIVED: Record<string, { bullish: Q[]; bearish: Q[] }> = {");

  for (const e of usable) {
    const eb = e.bullish.slice(0, 3).map((s) => `${s.quadrant.slice(0, 4)} ${s.lift}×/${s.n}`).join(", ");
    const er = e.bearish.slice(0, 3).map((s) => `${s.quadrant.slice(0, 4)} ${s.lift}×/${s.n}`).join(", ");
    lines.push(`  // ${e.symbol} — ${e.samples} months (${e.from} → ${e.to})`);
    lines.push(`  //   bullish: ${eb || "no regime cleared the floor"}`);
    lines.push(`  //   bearish: ${er || "no regime cleared the floor"}`);
    lines.push(
      `  ${JSON.stringify(e.symbol)}: { bullish: ${JSON.stringify(e.derived.bullish)}, bearish: ${JSON.stringify(
        e.derived.bearish,
      )} },`,
    );
  }

  lines.push("};");
  lines.push("");

  const skipped = evidence.filter((e) => !e.sufficient);
  if (skipped.length > 0) {
    lines.push("/* Below the sample floor, using the hand-written entry:");
    for (const e of skipped) lines.push(`   ${e.symbol} — ${e.samples} months`);
    lines.push("*/");
    lines.push("");
  }

  return lines.join("\n");
}
