/* ────────────────────────────────────────────────────────────────
   Composite-score engine — pure, deterministic, no IO (mirrors the
   posture of regime/engine.ts). Everything here is a plain function
   over already-fetched data, so it is fully fixture-testable and the
   ingest cycle (ingest/scorePipeline.ts) is the only part that talks
   to a DB or a clock.

   Shipped this pass (docs/scores-plan.md, Phase 1, sequencing #1):
     • computeSpreadSignal — the Brent–WTI spread as a first-class
       derived signal. Both legs already live in daily_prices, so no
       new source is needed. This is also the first leg Flow Stress
       will consume.

   Scaffolded + tested, not yet wired into the cycle (awaits its
   other legs — regional stock draw, throughput — per the plan):
     • combineComposite / computeFlowStress — the null-safe weighted
       combiner every composite score reuses. It reweights over the
       legs that actually have data and refuses to emit a number until
       at least `minLegs` are live, so a half-covered composite reads
       "PENDING" instead of faking a full reading.
──────────────────────────────────────────────────────────────── */

import { ScoreComponent, ScoreId, ScoreSnapshot, ScoreStatus } from "../core/scoreTypes";

/** One (date, value) point of a daily series. Bundle-safe local shape
 *  so callers can map DailyPrice → PricePoint without dragging the DB
 *  layer into pure code. */
export interface PricePoint {
  date: string; // YYYY-MM-DD
  value: number;
}

/* ── small numeric helpers ────────────────────────────────────── */

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

/** Signed USD, e.g. 3.2 → "$3.20", −1.5 → "−$1.50". */
function usd(x: number): string {
  return `${x < 0 ? "−" : ""}$${Math.abs(x).toFixed(2)}`;
}

/** Fraction of `values` less than or equal to `x` (0..1). Empty → 0.5. */
export function percentileOf(values: number[], x: number): number {
  if (values.length === 0) return 0.5;
  let le = 0;
  for (const v of values) if (v <= x) le++;
  return le / values.length;
}

/* ── Brent–WTI spread (primitive signal) ──────────────────────────
   spread = Brent close − WTI close on a shared market day.
   Brent normally trades ABOVE WTI, so the spread is usually positive
   (a few dollars). A WIDE spread means US crude is relatively cheap →
   stronger pull to export it → more US-Gulf flow stress. That is why
   the normalized percentile below is used, unchanged, as the spread
   LEG of Flow Stress: higher percentile = higher stress contribution. */

const SPREAD_WINDOW = 60; // trailing sessions the percentile/range span
const SPREAD_MIN_POINTS = 10; // below this we decline to score
const SPREAD_CHANGE_LOOKBACK = 30; // sessions for the "widened/narrowed" delta

/** Inner-join two daily series on date → Brent−WTI spread points,
 *  ascending by date. Only dates present in BOTH series survive. */
export function alignSpread(wti: PricePoint[], brent: PricePoint[]): PricePoint[] {
  const w = new Map<string, number>();
  for (const p of wti) if (Number.isFinite(p.value)) w.set(p.date, p.value);
  const out: PricePoint[] = [];
  for (const b of brent) {
    const wv = w.get(b.date);
    if (wv !== undefined && Number.isFinite(b.value)) {
      out.push({ date: b.date, value: b.value - wv });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export function computeSpreadSignal(
  wti: PricePoint[],
  brent: PricePoint[],
  runDate: string,
  opts: { window?: number } = {},
): ScoreSnapshot {
  const window = opts.window ?? SPREAD_WINDOW;
  const spreads = alignSpread(wti, brent);
  const newest = spreads.length > 0 ? spreads[spreads.length - 1] : null;

  if (spreads.length < SPREAD_MIN_POINTS) {
    return {
      scoreId: "brent_wti_spread",
      runDate,
      score: null,
      status: "insufficient",
      label: "NO DATA",
      headline:
        "Not enough overlapping WTI and Brent closes to compute the Brent–WTI spread.",
      components: [
        {
          key: "brent_wti_spread",
          label: "Brent–WTI spread",
          value: newest ? round(newest.value, 2) : null,
          unit: "$/bbl",
          normalized: null,
          weight: 1,
          asOf: newest ? newest.date : null,
        },
      ],
      coverage: { available: newest ? 1 : 0, total: 1 },
    };
  }

  const latest = spreads[spreads.length - 1];
  const recent = spreads.slice(-window);
  const values = recent.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const pct = percentileOf(values, latest.value); // 0..1

  const backIdx = Math.max(0, spreads.length - 1 - SPREAD_CHANGE_LOOKBACK);
  const change = latest.value - spreads[backIdx].value;
  const dir = change > 0.05 ? "widened" : change < -0.05 ? "narrowed" : "held";

  const label = pct >= 0.8 ? "WIDE" : pct <= 0.2 ? "NARROW" : "NORMAL";
  const status: ScoreStatus = pct >= 0.75 ? "elevated" : pct <= 0.25 ? "muted" : "normal";

  const headline =
    `Brent–WTI ${usd(latest.value)} · ${Math.round(pct * 100)}th pct of ${values.length} sessions ` +
    `· ${dir} ${usd(Math.abs(change))} over ~${SPREAD_CHANGE_LOOKBACK}d`;

  return {
    scoreId: "brent_wti_spread",
    runDate,
    score: Math.round(pct * 100),
    status,
    label,
    headline,
    components: [
      {
        key: "brent_wti_spread",
        label: "Brent–WTI spread",
        value: round(latest.value, 2),
        unit: "$/bbl",
        normalized: round(pct, 4),
        weight: 1,
        asOf: latest.date,
        note: `${values.length}d range ${usd(min)}–${usd(max)} · mean ${usd(mean)}`,
      },
    ],
    coverage: { available: 1, total: 1 },
  };
}

/* ── generic composite combiner (Flow Stress / Tightness / Macro) ──
   Reweights over the legs that actually carry data, so a composite
   with some legs still dark scores on what IS live rather than
   treating missing legs as zero. Emits score=null / status
   "insufficient" until at least `minLegs` legs are live. */

export interface CombineOptions {
  /** Minimum live legs before a number is emitted. Default 2. */
  minLegs?: number;
  /** score ≥ this ⇒ "elevated". Default 66. */
  elevatedAt?: number;
  /** score ≤ this ⇒ "muted". Default 33. */
  mutedAt?: number;
  /** Map a 0..100 score → badge label. Default ELEVATED/NORMAL/MUTED. */
  labelOf?: (score: number, status: ScoreStatus) => string;
  /** Build the one-line headline. Default lists the live leg count. */
  headlineOf?: (score: number, available: number, total: number) => string;
}

/**
 * Combine weighted legs into one ScoreSnapshot. `legs` already carry
 * their own `normalized` (0..1) and `weight`; legs with a null
 * `normalized` are excluded from the math and counted against
 * coverage. Pure — the caller supplies runDate.
 */
export function combineComposite(
  scoreId: ScoreId,
  runDate: string,
  legs: ScoreComponent[],
  opts: CombineOptions = {},
): ScoreSnapshot {
  const minLegs = opts.minLegs ?? 2;
  const elevatedAt = opts.elevatedAt ?? 66;
  const mutedAt = opts.mutedAt ?? 33;

  const live = legs.filter((l) => l.normalized !== null && Number.isFinite(l.normalized));
  const total = legs.length;
  const available = live.length;

  if (available < minLegs) {
    return {
      scoreId,
      runDate,
      score: null,
      status: "insufficient",
      label: "PENDING",
      headline: `Awaiting inputs — ${available}/${total} legs live.`,
      components: legs,
      coverage: { available, total },
    };
  }

  const wSum = live.reduce((a, l) => a + (l.weight > 0 ? l.weight : 0), 0) || 1;
  const composite = live.reduce((a, l) => a + (l.normalized as number) * l.weight, 0) / wSum; // 0..1
  const score = Math.round(clamp01(composite) * 100);
  const status: ScoreStatus =
    score >= elevatedAt ? "elevated" : score <= mutedAt ? "muted" : "normal";
  const label = opts.labelOf
    ? opts.labelOf(score, status)
    : status === "elevated"
      ? "ELEVATED"
      : status === "muted"
        ? "MUTED"
        : "NORMAL";
  const headline = opts.headlineOf
    ? opts.headlineOf(score, available, total)
    : `${score}/100 · ${available}/${total} legs live`;

  return { scoreId, runDate, score, status, label, headline, components: legs, coverage: { available, total } };
}

/**
 * Flow Stress — corridor supply-side strain. Legs (per the plan):
 * widening Brent–WTI spread, export strength, regional stock draw,
 * throughput deviation. Callers pass whichever legs are live; the
 * combiner handles the rest. Not yet wired into the cycle — awaits
 * the stock-draw and throughput legs.
 */
export function computeFlowStress(runDate: string, legs: ScoreComponent[]): ScoreSnapshot {
  return combineComposite("flow_stress", runDate, legs, {
    minLegs: 2,
    labelOf: (score) => (score >= 66 ? "STRESSED" : score <= 33 ? "CALM" : "MODERATE"),
    headlineOf: (score, available, total) =>
      `Flow stress ${score}/100 · ${available}/${total} corridor legs live`,
  });
}
