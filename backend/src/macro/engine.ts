/* ────────────────────────────────────────────────────────────────
   Macro engine — pure, deterministic, fixture-testable. No IO.

   Two readings off the same FRED panel (sources/fredMacro.ts):

   1. computeMacroRegime — the Darius-Dale-style GRID (P·06). Two axes
      on a RATE-OF-CHANGE basis (is growth / inflation accelerating or
      decelerating — the 2nd derivative, not the level) → four
      quadrants: Goldilocks / Reflation / Inflation / Deflation.

   2. computeMacroPressure — the "Macro pressure" half of Macro
      Override (#5): a 0..100 headwind-for-oil reading from the dollar,
      the curve, credit spreads and growth momentum, plus the
      divergence flag that makes the chip fire (oil rising while the
      macro backdrop weakens). Fixed, documented scales (v1) — no
      history-fitting; percentile refinement can come later.

   All scales are chosen to be legible and least-overfit, and every leg
   stays individually inspectable (the composite never hides its legs).
──────────────────────────────────────────────────────────────── */

import { MacroObservation, MacroSeries } from "../sources/fredMacro";
import { CotObservation } from "../sources/cftcCot";
import {
  MacroAxisRead,
  MacroPressureSnapshot,
  MacroQuadrant,
  MacroRegimeSnapshot,
  PositioningSnapshot,
  PositioningStance,
} from "./types";

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

/* ── observation helpers (obs assumed ascending by date) ─────────── */

function latestObs(obs: MacroObservation[]): MacroObservation | null {
  return obs.length ? obs[obs.length - 1] : null;
}
function daysBefore(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
function valueOnOrBefore(obs: MacroObservation[], isoDate: string): MacroObservation | null {
  let found: MacroObservation | null = null;
  for (const o of obs) {
    if (o.date <= isoDate) found = o;
    else break;
  }
  return found;
}
function pctChange(now: number, then: number): number | null {
  return then !== 0 ? ((now - then) / Math.abs(then)) * 100 : null;
}

/**
 * Year-over-year change of the level, plus momentum (the change in that
 * YoY vs `momentumWindowDays` ago — the accel/decel signal). Date-based
 * lookups, so it works for both monthly and daily series.
 */
export function yoyAndMomentum(
  obs: MacroObservation[],
  momentumWindowDays: number,
): MacroAxisRead {
  const latest = latestObs(obs);
  if (!latest) return { yoy: null, momentum: null, accelerating: null, asOf: null };

  const yearAgo = valueOnOrBefore(obs, daysBefore(latest.date, 365));
  const yoy = yearAgo ? pctChange(latest.value, yearAgo.value) : null;

  const priorDate = daysBefore(latest.date, momentumWindowDays);
  const prior = valueOnOrBefore(obs, priorDate);
  const priorYearAgo = valueOnOrBefore(obs, daysBefore(priorDate, 365));
  const yoyPrior = prior && priorYearAgo ? pctChange(prior.value, priorYearAgo.value) : null;

  const momentum = yoy !== null && yoyPrior !== null ? yoy - yoyPrior : null;
  return {
    yoy: yoy === null ? null : round(yoy, 2),
    momentum: momentum === null ? null : round(momentum, 2),
    accelerating: momentum === null ? null : momentum >= 0,
    asOf: latest.date,
  };
}

const QUADRANT_COPY: Record<Exclude<MacroQuadrant, "PENDING">, { headline: string; favored: string }> = {
  GOLDILOCKS: {
    headline: "Growth accelerating, inflation cooling — Goldilocks.",
    favored: "Historically favors equities and risk; a tailwind for cyclical demand.",
  },
  REFLATION: {
    headline: "Growth and inflation both accelerating — Reflation.",
    favored: "Historically favors commodities and real assets, incl. energy.",
  },
  INFLATION: {
    headline: "Growth decelerating, inflation accelerating — Inflation/Stagflation.",
    favored: "Historically favors inflation hedges; energy mixed as demand softens.",
  },
  DEFLATION: {
    headline: "Growth and inflation both decelerating — Deflation.",
    favored: "Historically favors duration/defensives; a headwind for oil demand.",
  },
};

/** GRID quadrant from the two axes' accel/decel signs. */
export function computeMacroRegime(
  growthObs: MacroObservation[],
  inflationObs: MacroObservation[],
  runDate: string,
): MacroRegimeSnapshot {
  const growth = yoyAndMomentum(growthObs, 120);
  const inflation = yoyAndMomentum(inflationObs, 120);
  const available = (growth.accelerating !== null ? 1 : 0) + (inflation.accelerating !== null ? 1 : 0);

  if (available < 2) {
    return {
      runDate,
      quadrant: "PENDING",
      growth,
      inflation,
      headline: `Awaiting macro inputs — ${available}/2 axes live.`,
      favored: "—",
      coverage: { available, total: 2 },
    };
  }

  const g = growth.accelerating as boolean;
  const i = inflation.accelerating as boolean;
  const quadrant: MacroQuadrant = g
    ? i
      ? "REFLATION"
      : "GOLDILOCKS"
    : i
      ? "INFLATION"
      : "DEFLATION";
  const copy = QUADRANT_COPY[quadrant as Exclude<MacroQuadrant, "PENDING">];
  return { runDate, quadrant, growth, inflation, headline: copy.headline, favored: copy.favored, coverage: { available, total: 2 } };
}

/* ── Macro pressure (Macro Override half) ─────────────────────────
   Each leg → 0..1 headwind-for-oil, on a fixed documented scale. */

function seriesFor(panel: MacroSeries[], key: string): MacroObservation[] {
  return panel.find((s) => s.key === key)?.observations ?? [];
}
/** Percent change of a series over ~`days`. */
function changeOver(obs: MacroObservation[], days: number): number | null {
  const latest = latestObs(obs);
  if (!latest) return null;
  const then = valueOnOrBefore(obs, daysBefore(latest.date, days));
  return then ? pctChange(latest.value, then.value) : null;
}

interface PressureLeg {
  key: string;
  label: string;
  value: number | null;
  normalized: number | null;
  note: string;
}

/**
 * Macro pressure — headwind for oil from four legs (equal weight over
 * whichever are live). Higher = more macro pressure against oil.
 * `oilMomentum` (e.g. WTI % over ~60d) drives the divergence flag.
 */
export function computeMacroPressure(
  panel: MacroSeries[],
  oilMomentum: number | null,
  runDate: string,
): MacroPressureSnapshot {
  const legs: PressureLeg[] = [];

  // Dollar strength — rising broad USD is a headwind. 6-month %change:
  // −5%→0, +5%→1.
  const dollarChg = changeOver(seriesFor(panel, "dollar_broad"), 182);
  legs.push({
    key: "dollar_broad",
    label: "Broad USD (6m)",
    value: dollarChg === null ? null : round(dollarChg, 2),
    normalized: dollarChg === null ? null : round(clamp01((dollarChg + 5) / 10), 4),
    note: "6m %chg · −5%→0, +5%→1",
  });

  // Yield curve — inversion signals growth risk. 10y–2y level: +1.0%→0,
  // −1.0%→1.
  const curveLatest = latestObs(seriesFor(panel, "curve_10y2y"));
  legs.push({
    key: "curve_10y2y",
    label: "10y–2y spread",
    value: curveLatest ? curveLatest.value : null,
    normalized: curveLatest ? round(clamp01((1.0 - curveLatest.value) / 2.0), 4) : null,
    note: "level · +1.0→0, −1.0→1",
  });

  // Credit — HY OAS widening signals stress. 3.0%→0, 8.0%→1.
  const oasLatest = latestObs(seriesFor(panel, "credit_hy_oas"));
  legs.push({
    key: "credit_hy_oas",
    label: "HY OAS",
    value: oasLatest ? oasLatest.value : null,
    normalized: oasLatest ? round(clamp01((oasLatest.value - 3) / 5), 4) : null,
    note: "level · 3%→0, 8%→1",
  });

  // Growth momentum — decelerating industrial production is a headwind.
  // Δyoy: +2→0, −2→1.
  const growth = yoyAndMomentum(seriesFor(panel, "growth_indpro"), 120);
  legs.push({
    key: "growth_indpro",
    label: "Growth momentum",
    value: growth.momentum,
    normalized: growth.momentum === null ? null : round(clamp01((2 - growth.momentum) / 4), 4),
    note: "Δyoy · +2→0, −2→1",
  });

  const live = legs.filter((l) => l.normalized !== null);
  const available = live.length;
  const total = legs.length;
  if (available < 2) {
    return {
      runDate,
      score: null,
      status: "insufficient",
      diverging: false,
      headline: `Awaiting macro inputs — ${available}/${total} legs live.`,
      components: legs,
      coverage: { available, total },
    };
  }

  const composite = live.reduce((a, l) => a + (l.normalized as number), 0) / available;
  const score = Math.round(clamp01(composite) * 100);
  const status = score >= 66 ? "elevated" : score <= 33 ? "muted" : "normal";
  // Divergence: oil rising while the macro backdrop is a headwind.
  const diverging = oilMomentum !== null && oilMomentum > 0 && score >= 60;
  const headline = diverging
    ? `Macro divergence — oil firm while macro pressure ${score}/100.`
    : `Macro pressure ${score}/100 · ${available}/${total} legs live.`;

  return { runDate, score, status, diverging, headline, components: legs, coverage: { available, total } };
}

/* ── Positioning (Macro Override's other half, P7) ────────────────
   Managed-money net length + its 1-year percentile. A separate named
   data family (CFTC COT), never folded into the FRED macro half. */

const POSITIONING_MIN_WEEKS = 26; // below this, a 1-yr percentile is noise
const POSITIONING_WINDOW = 52; // trailing weeks for the percentile

/** Managed-money net length + 1-yr percentile → crowded-long/short stance. */
export function computePositioning(
  observations: CotObservation[],
  runDate: string,
  market = "WTI (NYMEX)",
): PositioningSnapshot {
  const total = POSITIONING_WINDOW;
  const available = observations.length;
  const nfmt = (n: number) => Math.round(n).toLocaleString("en-US");

  if (available === 0) {
    return {
      runDate, reportDate: null, market,
      netLength: null, longs: null, shorts: null, percentile1y: null,
      stance: "PENDING", status: "insufficient",
      headline: "Awaiting CFTC COT data.", coverage: { available: 0, total },
    };
  }

  const latest = observations[observations.length - 1];
  if (available < POSITIONING_MIN_WEEKS) {
    return {
      runDate, reportDate: latest.date, market,
      netLength: latest.net, longs: latest.longs, shorts: latest.shorts, percentile1y: null,
      stance: "PENDING", status: "insufficient",
      headline: `Managed-money net ${nfmt(latest.net)} — building 1-yr history (${available}/${POSITIONING_MIN_WEEKS} wks).`,
      coverage: { available, total },
    };
  }

  const window = observations.slice(-POSITIONING_WINDOW);
  const nets = window.map((o) => o.net);
  const pct = nets.filter((v) => v <= latest.net).length / nets.length;
  const stance: PositioningStance = pct >= 0.8 ? "CROWDED_LONG" : pct <= 0.2 ? "CROWDED_SHORT" : "NEUTRAL";
  const pctile = Math.round(pct * 100);
  const headline =
    stance === "CROWDED_LONG"
      ? `Managed money crowded long — net ${nfmt(latest.net)}, ${pctile}th pctile (1y).`
      : stance === "CROWDED_SHORT"
        ? `Managed money crowded short — net ${nfmt(latest.net)}, ${pctile}th pctile (1y).`
        : `Managed-money net ${nfmt(latest.net)} — ${pctile}th pctile (1y), neutral.`;

  return {
    runDate, reportDate: latest.date, market,
    netLength: latest.net, longs: latest.longs, shorts: latest.shorts,
    percentile1y: round(pct, 4), stance, status: "live", headline,
    coverage: { available: window.length, total },
  };
}
