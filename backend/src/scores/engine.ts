/* ────────────────────────────────────────────────────────────────
   Composite-score engine — pure, deterministic, no IO (mirrors the
   posture of regime/engine.ts). Everything here is a plain function
   over already-fetched data, so it is fully fixture-testable and the
   ingest cycle (ingest/scorePipeline.ts) is the only part that talks
   to a DB or a clock.

   Shipped (docs/scores-plan.md):
     • computeSpreadSignal — the Brent–WTI spread primitive (Phase 1).
     • combineComposite — the null-safe weighted combiner every
       composite reuses: reweights over the legs that actually have
       data and refuses to emit a number until `minLegs` are live, so
       a half-covered composite reads "PENDING" instead of faking a
       full reading.
     • computeFlowStress + its four legs (Phase 1) — throughput
       deviation, export strength, regional stock draw, spread.
     • computeTightness + its legs (Phase 2) — inventories vs the 5-yr
       week-of-year seasonal band, refinery utilization, crack proxy
       (visible-but-dark until the futures-derived cracks land).
──────────────────────────────────────────────────────────────── */

import { ScoreComponent, ScoreId, ScoreSnapshot, ScoreStatus } from "../core/scoreTypes";
import { SeasonalBaseline } from "../core/seasonalTypes";
import { isoWeekOf } from "../core/time";

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

/* ── Flow Stress leg builders ─────────────────────────────────────
   Each returns a ScoreComponent — normalized ∈ [0,1] when live, or
   value=null/normalized=null when its inputs are missing, so the
   combiner's coverage accounting stays honest. All legs carry equal
   weight 1 (a deliberate, documented default: with no evidence for
   any other weighting, equal weight is the least-overfit choice; the
   combiner reweights over whichever legs are live). Pure functions —
   the pipeline does all IO. */

const EXPORT_MIN_POINTS = 4; // below this, percentile-vs-history is noise
const STOCK_DRAW_LOOKBACK_DAYS = 28; // "4-week draw" window
const STOCK_DRAW_FULL_SCALE_PCT = 5; // ±5% over 4w maps to the ends of [0,1]

/**
 * Export strength — latest weekly crude_exports vs its own accumulated
 * history (percentile over the points provided, min EXPORT_MIN_POINTS).
 * History self-improves as corridor_metrics accumulates; with a short
 * window the percentile is coarse but honest.
 */
export function computeExportStrengthLeg(history: PricePoint[]): ScoreComponent {
  const pts = history.filter((p) => Number.isFinite(p.value));
  const latest = pts.length > 0 ? pts[pts.length - 1] : null;
  if (pts.length < EXPORT_MIN_POINTS || !latest) {
    return {
      key: "export_strength",
      label: "US crude export strength",
      value: latest ? round(latest.value, 2) : null,
      unit: "Mb/d",
      normalized: null,
      weight: 1,
      asOf: latest ? latest.date : null,
      note: `needs ≥${EXPORT_MIN_POINTS} weekly points (${pts.length} on file)`,
    };
  }
  const values = pts.map((p) => p.value);
  const pct = percentileOf(values, latest.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    key: "export_strength",
    label: "US crude export strength",
    value: round(latest.value, 2),
    unit: "Mb/d",
    normalized: round(pct, 4),
    weight: 1,
    asOf: latest.date,
    note: `${Math.round(pct * 100)}th pct of ${values.length}w · range ${min.toFixed(2)}–${max.toFixed(2)} Mb/d`,
  };
}

/** 4-week percent change of the newest point vs the newest point at
 *  least STOCK_DRAW_LOOKBACK_DAYS older. null when the span is short. */
function fourWeekPctChange(series: PricePoint[]): { pct: number; asOf: string } | null {
  const pts = series.filter((p) => Number.isFinite(p.value));
  if (pts.length < 2) return null;
  const latest = pts[pts.length - 1];
  const cutoff = new Date(`${latest.date}T00:00:00Z`).getTime() - STOCK_DRAW_LOOKBACK_DAYS * 86_400_000;
  // newest point at/before the cutoff
  let base: PricePoint | null = null;
  for (const p of pts) {
    if (new Date(`${p.date}T00:00:00Z`).getTime() <= cutoff) base = p;
  }
  if (!base || base.value === 0) return null;
  return { pct: ((latest.value - base.value) / Math.abs(base.value)) * 100, asOf: latest.date };
}

/** Draw stress mapping: −FULL_SCALE% (draw) → 1, 0% → 0.5, +FULL_SCALE% (build) → 0. */
function drawToNormalized(pct: number): number {
  return clamp01(0.5 - pct / (2 * STOCK_DRAW_FULL_SCALE_PCT));
}

/**
 * Regional stock draw — 4-week % change of US crude (WCESTUS1) and
 * Cushing (W_EPC0_SAX_YCUOK_MBBL) stocks, each mapped through a fixed,
 * documented scale (±5% over 4w = full scale) and averaged over
 * whichever series are live. A fixed scale is deliberately transparent
 * v1 normalization; a percentile-vs-history swap can come once enough
 * weekly history accumulates. Displayed value = US 4-week change in
 * Mbbl (falls back to Cushing when US is missing).
 */
export function computeStockDrawLeg(
  usCrude: PricePoint[],
  cushing: PricePoint[],
): ScoreComponent {
  const us = fourWeekPctChange(usCrude);
  const cu = fourWeekPctChange(cushing);

  const parts: { name: string; pct: number }[] = [];
  if (us) parts.push({ name: "US", pct: us.pct });
  if (cu) parts.push({ name: "Cushing", pct: cu.pct });

  if (parts.length === 0) {
    return {
      key: "stock_draw",
      label: "Regional stock draw",
      value: null,
      unit: "Mbbl",
      normalized: null,
      weight: 1,
      asOf: null,
      note: "needs ≥4 weeks of US or Cushing stocks history",
    };
  }

  const normalized = parts.reduce((a, p) => a + drawToNormalized(p.pct), 0) / parts.length;

  // Display value: absolute 4-week change of the primary live series.
  const primary = us ?? cu;
  const primarySeries = us ? usCrude : cushing;
  const pts = primarySeries.filter((p) => Number.isFinite(p.value));
  const latest = pts[pts.length - 1];
  const cutoffMs =
    new Date(`${latest.date}T00:00:00Z`).getTime() - STOCK_DRAW_LOOKBACK_DAYS * 86_400_000;
  let base = pts[0];
  for (const p of pts) {
    if (new Date(`${p.date}T00:00:00Z`).getTime() <= cutoffMs) base = p;
  }
  const deltaMbbl = latest.value - base.value;

  const noteParts = parts.map(
    (p) => `${p.name} ${p.pct >= 0 ? "+" : "−"}${Math.abs(p.pct).toFixed(1)}%`,
  );
  return {
    key: "stock_draw",
    label: "Regional stock draw",
    value: round(deltaMbbl, 1),
    unit: "Mbbl",
    normalized: round(clamp01(normalized), 4),
    weight: 1,
    asOf: primary!.asOf,
    note: `4w: ${noteParts.join(" · ")}`,
  };
}

/** One chokepoint's current 7d tanker volume + its 1y norm band. */
export interface GateThroughput {
  corridor: string;
  /** Latest tanker_volume_7d, Mt/d. */
  current: number;
  /** corridor_baselines (metric tanker_volume, win 1y). */
  mean: number;
  p10: number | null;
}

/**
 * Throughput deviation — worst-gate shortfall below the 1y norm:
 * clamp01((mean − current) / (mean − p10)) per gate, leg = the worst
 * gate. 0 = at/above norm, 1 = at/below the p10 floor. Surges above
 * norm deliberately do NOT count as stress — this leg reads supply
 * disruption, not flow direction. Gates without a valid band
 * (p10 ≥ mean, or missing) are skipped and reported in the note.
 */
export function computeThroughputDeviationLeg(gates: GateThroughput[]): ScoreComponent {
  const scored: { corridor: string; current: number; shortfall: number; ofNorm: number }[] = [];
  for (const g of gates) {
    if (!Number.isFinite(g.current) || !Number.isFinite(g.mean) || g.mean <= 0) continue;
    if (g.p10 === null || !Number.isFinite(g.p10) || g.p10 >= g.mean) continue;
    const shortfall = clamp01((g.mean - g.current) / (g.mean - g.p10));
    scored.push({ corridor: g.corridor, current: g.current, shortfall, ofNorm: g.current / g.mean });
  }

  if (scored.length === 0) {
    return {
      key: "throughput_deviation",
      label: "Chokepoint throughput deviation",
      value: null,
      unit: "Mt/d",
      normalized: null,
      weight: 1,
      asOf: null,
      note: "no gate has both a live 7d volume and a valid 1y band",
    };
  }

  scored.sort((a, b) => b.shortfall - a.shortfall);
  const worst = scored[0];
  return {
    key: "throughput_deviation",
    label: "Chokepoint throughput deviation",
    value: round(worst.current, 2),
    unit: "Mt/d",
    normalized: round(worst.shortfall, 4),
    weight: 1,
    asOf: null, // gate metrics carry their own period dates; the pipeline stamps run day
    note: `worst: ${worst.corridor} at ${Math.round(worst.ofNorm * 100)}% of 1y norm · ${scored.length} gates read`,
  };
}

/* ── Tightness legs (Phase 2 — docs/scores-plan.md) ──────────────
   Same contract as the Flow Stress legs: pure builders returning a
   ScoreComponent with normalized ∈ [0,1] (higher = tighter physical
   market) or an honest null-leg. Equal weight 1 throughout. */

/** Latest level of one stock metric, in Mbbl. */
export interface StockLevel {
  metric: string;
  value: number;
  asOf: string; // YYYY-MM-DD
}

/** The stock trio Tightness compares against its seasonal bands. */
const TIGHTNESS_STOCK_METRICS = ["us_crude_stocks", "gasoline_stocks", "distillate_stocks"] as const;

const UTILIZATION_FLOOR_PCT = 85; // → 0 (slack refining system)
const UTILIZATION_CEIL_PCT = 100; // → 1 (running flat out)

/** Current week's band for a metric, falling back 53→52 (week 53 is
 *  dropped at fetch time when too thin — see eiaSeasonal.ts). */
function bandFor(
  bands: SeasonalBaseline[],
  metric: string,
  isoWeek: number,
): SeasonalBaseline | null {
  const exact = bands.find((b) => b.metric === metric && b.isoWeek === isoWeek);
  if (exact) return exact;
  if (isoWeek === 53) return bands.find((b) => b.metric === metric && b.isoWeek === 52) ?? null;
  return null;
}

/**
 * Inventories vs 5-yr seasonal range — for each of crude/gasoline/
 * distillate, where does today's level sit inside this ISO week's
 * 5-year [min, max] band? Position 0 (at/below the 5y low) = fully
 * tight (1.0); position 1 (at/above the 5y high) = fully slack (0).
 * Averaged over live series; needs ≥2 of the trio to emit — one
 * product alone is not "inventories". Degenerate bands (max ≤ min)
 * are skipped. Displayed value = US crude level.
 */
export function computeSeasonalTightnessLeg(
  levels: StockLevel[],
  bands: SeasonalBaseline[],
  runDate: string,
): ScoreComponent {
  const isoWeek = isoWeekOf(runDate);
  const parts: { name: string; posPct: number; tight: number }[] = [];
  let newestAsOf: string | null = null;
  for (const metric of TIGHTNESS_STOCK_METRICS) {
    const level = levels.find((l) => l.metric === metric);
    const band = bandFor(bands, metric, isoWeek);
    if (!level || !band || !(band.maxValue > band.minValue)) continue;
    const pos = clamp01((level.value - band.minValue) / (band.maxValue - band.minValue));
    parts.push({
      name: metric.replace("us_crude_stocks", "crude").replace("_stocks", ""),
      posPct: Math.round(pos * 100),
      tight: 1 - pos,
    });
    if (newestAsOf === null || level.asOf > newestAsOf) newestAsOf = level.asOf;
  }

  const usCrude = levels.find((l) => l.metric === "us_crude_stocks") ?? null;
  if (parts.length < 2) {
    return {
      key: "inventories_seasonal",
      label: "Inventories vs 5-yr seasonal band",
      value: usCrude ? round(usCrude.value, 1) : null,
      unit: "Mbbl",
      normalized: null,
      weight: 1,
      asOf: usCrude ? usCrude.asOf : null,
      note: `needs ≥2 of crude/gasoline/distillate with a seasonal band (${parts.length} live)`,
    };
  }

  const normalized = parts.reduce((a, p) => a + p.tight, 0) / parts.length;
  const noteBits = parts.map((p) => `${p.name} ${p.posPct}%`);
  return {
    key: "inventories_seasonal",
    label: "Inventories vs 5-yr seasonal band",
    value: usCrude ? round(usCrude.value, 1) : round(levels[0].value, 1),
    unit: "Mbbl",
    normalized: round(clamp01(normalized), 4),
    weight: 1,
    asOf: newestAsOf,
    note: `of 5y band, wk ${isoWeek}: ${noteBits.join(" · ")} (0% = 5y low)`,
  };
}

/**
 * Refinery utilization — fixed documented scale: 85% → 0, 100% → 1.
 * High utilization = the refining system has no slack = tight.
 * Prefers the US-total series; the caller may pass PADD 3 as a
 * fallback (noted so the UI never silently swaps geographies).
 */
export function computeUtilizationLeg(
  util: { value: number; asOf: string; series: "US" | "PADD 3" } | null,
): ScoreComponent {
  if (!util || !Number.isFinite(util.value)) {
    return {
      key: "refinery_utilization",
      label: "Refinery utilization",
      value: null,
      unit: "%",
      normalized: null,
      weight: 1,
      asOf: null,
      note: "no utilization reading on file",
    };
  }
  const normalized = clamp01(
    (util.value - UTILIZATION_FLOOR_PCT) / (UTILIZATION_CEIL_PCT - UTILIZATION_FLOOR_PCT),
  );
  return {
    key: "refinery_utilization",
    label: "Refinery utilization",
    value: round(util.value, 1),
    unit: "%",
    normalized: round(normalized, 4),
    weight: 1,
    asOf: util.asOf,
    note: `${util.series} · scale ${UTILIZATION_FLOOR_PCT}%→0, ${UTILIZATION_CEIL_PCT}%→1`,
  };
}

/**
 * Crack proxy — deliberately dark in v1. The plan derives it from
 * RBOB/HO vs WTI futures (existing adapters, P4-era work); until that
 * lands, Tightness carries this as a visible pending leg so coverage
 * reads 2/3 honestly instead of pretending the composite is complete.
 */
export function crackPendingLeg(): ScoreComponent {
  return {
    key: "crack_proxy",
    label: "Crack proxy (RBOB/HO vs WTI)",
    value: null,
    unit: "$/bbl",
    normalized: null,
    weight: 1,
    asOf: null,
    note: "pending — derives from futures adapters (roadmap P4)",
  };
}

/**
 * Tightness — is the physical barrel scarce vs. its own seasonal
 * history? Legs: inventories vs 5-yr band, refinery utilization,
 * crack proxy (pending). minLegs 2 = inventories + utilization.
 */
export function computeTightness(runDate: string, legs: ScoreComponent[]): ScoreSnapshot {
  return combineComposite("tightness", runDate, legs, {
    minLegs: 2,
    labelOf: (score) => (score >= 66 ? "TIGHT" : score <= 33 ? "SLACK" : "BALANCED"),
    headlineOf: (score, available, total) =>
      `Physical tightness ${score}/100 · ${available}/${total} legs live`,
  });
}

/**
 * Spread leg — reuse the already-computed brent_wti_spread snapshot
 * (same run) rather than recomputing. Null-leg when the spread itself
 * was insufficient. A WIDE spread pulls US barrels to export → higher
 * flow stress, so the spread's percentile passes through unchanged.
 */
export function spreadLegFrom(spread: ScoreSnapshot | null): ScoreComponent {
  const src = spread?.components[0];
  const live =
    spread !== null &&
    spread.score !== null &&
    src !== undefined &&
    src.normalized !== null &&
    src.value !== null;
  return {
    key: "brent_wti_spread",
    label: "Brent–WTI spread",
    value: live ? src.value : null,
    unit: "$/bbl",
    normalized: live ? src.normalized : null,
    weight: 1,
    asOf: live ? src.asOf : null,
    note: live ? src.note : "spread signal not live this run",
  };
}
