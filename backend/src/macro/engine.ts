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
import { GlobalBondRead } from "./globalBonds";
import { daysBefore, latestObs, pctChange, valueOnOrBefore } from "../core/seriesMath";
import {
  LiquidityLeg,
  LiquidityStressSnapshot,
  MacroAxisRead,
  MacroPressureSnapshot,
  MacroQuadrant,
  MacroRegimeSnapshot,
  NominalGrowthSnapshot,
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
    favored: "Historically favors equities and credit; long duration underperforms real assets.",
  },
  REFLATION: {
    headline: "Growth and inflation both accelerating — Reflation.",
    favored: "Historically favors commodities, real assets and cyclicals over duration.",
  },
  INFLATION: {
    headline: "Growth decelerating, inflation accelerating — Inflation/Stagflation.",
    favored: "Historically favors inflation hedges and pricing power; duration and multiples compress.",
  },
  DEFLATION: {
    headline: "Growth and inflation both decelerating — Deflation.",
    favored: "Historically favors duration and defensives; cyclical and credit risk underperform.",
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

/* ── Liquidity / cost-of-capital primitives ───────────────────────
   Shared by computeLiquidityStress. Pure, fixture-testable, no IO. */

/**
 * Realized volatility of a series' period-over-period changes over the
 * last `window` observations.
 *
 * `mode` matters and is not cosmetic:
 * - "diff" — absolute change, for series already expressed as a RATE
 *   (DGS10 is a percent; a move from 4.0 to 4.1 is +10bp, not +2.5%).
 *   Returned in the series' own units.
 * - "pct"  — percent change, for series expressed as a LEVEL/index
 *   (DTWEXBGS, an ETF price).
 *
 * Population σ (not sample) — with a 20-obs window the difference is
 * immaterial and population keeps the estimator monotone in the data.
 * Returns null when the window can't be filled: a vol number computed
 * from 3 observations would be noise dressed as a signal.
 */
export function realizedVol(
  obs: MacroObservation[],
  window: number,
  mode: "diff" | "pct",
): number | null {
  if (window < 2 || obs.length < window + 1) return null;
  const slice = obs.slice(-(window + 1));

  const changes: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].value;
    const cur = slice[i].value;
    if (mode === "pct") {
      if (prev === 0) return null;
      changes.push(((cur - prev) / Math.abs(prev)) * 100);
    } else {
      changes.push(cur - prev);
    }
  }
  if (changes.length === 0) return null;

  const mean = changes.reduce((a, c) => a + c, 0) / changes.length;
  const variance = changes.reduce((a, c) => a + (c - mean) ** 2, 0) / changes.length;
  return Math.sqrt(variance);
}

/**
 * Fraction of `values` at or below `v` — 0..1. Used to percentile a
 * volatility read against its own trailing history.
 *
 * Vol legs are percentiled rather than put on a fixed scale (unlike the
 * level legs) because "high rate volatility" in bp means something
 * completely different at 1% yields than at 5%. The percentile is
 * regime-relative by construction, which is the property Dale's
 * "broke out to bullish" claim actually needs.
 */
export function percentileRank(values: number[], v: number): number | null {
  if (values.length === 0) return null;

  // A percentile within a constant history carries no information, and
  // returning one is actively dangerous: a dead-flat rate series gives
  // a realized vol of 0 against a history of 0s, which ranks as the
  // 100th percentile — reading as a volatility BREAKOUT when it is the
  // exact opposite. Null instead, so the leg drops out of the
  // composite rather than voting with a fabricated extreme.
  let min = values[0];
  let max = values[0];
  for (const x of values) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  if (min === max) return null;

  return values.filter((x) => x <= v).length / values.length;
}

/**
 * Rolling realized vol, one reading per observation from `window+1`
 * onward — the history a percentile needs. Trimmed to the last
 * `history` readings so the percentile window is bounded and explicit.
 */
export function rollingVol(
  obs: MacroObservation[],
  window: number,
  mode: "diff" | "pct",
  history: number,
): number[] {
  const out: number[] = [];
  for (let end = window + 1; end <= obs.length; end++) {
    const v = realizedVol(obs.slice(0, end), window, mode);
    if (v !== null) out.push(v);
  }
  return out.slice(-history);
}

/**
 * Fed net liquidity = total assets − Treasury General Account −
 * overnight reverse repo, aligned onto WALCL's weekly dates.
 *
 * UNITS: WALCL and WTREGEN are $millions, RRPONTSYD is $billions. The
 * ×1000 on RRP is the whole reason this is a named function rather
 * than an inline subtraction — getting it wrong understates the RRP
 * drain by three orders of magnitude and silently flatters liquidity.
 * Result is in $millions.
 *
 * TGA and RRP are looked up as of each WALCL date (newest on or
 * before), so a missing daily RRP print carries forward rather than
 * punching a hole in the series.
 */
export function netLiquiditySeries(panel: MacroSeries[]): MacroObservation[] {
  const assets = seriesFor(panel, "fed_assets");
  const tga = seriesFor(panel, "fed_tga");
  const rrp = seriesFor(panel, "fed_rrp");
  if (assets.length === 0) return [];

  const out: MacroObservation[] = [];
  for (const a of assets) {
    const t = valueOnOrBefore(tga, a.date);
    const r = valueOnOrBefore(rrp, a.date);
    // Both drains must be known — a partial subtraction is worse than
    // no reading, because it looks like a liquidity expansion.
    if (!t || !r) continue;
    out.push({ date: a.date, value: a.value - t.value - r.value * 1000 });
  }
  return out;
}

/* ── Nominal growth vs its own trend ──────────────────────────────
   Dale's point 2: nominal GDP is running above trend, which is what
   is pulling bond yields up. He quotes GLOBAL nominal GDP; we only
   have US for free, so we compute the US series against the US's own
   trend windows rather than borrowing his global trend numbers. The
   comparison stays internally consistent; the UI says which it is. */

/** Mean YoY over a calendar window, computed from the same series. */
function meanYoyOver(
  obs: MacroObservation[],
  fromIso: string,
  toIso: string,
): number | null {
  const yoys: number[] = [];
  for (const o of obs) {
    if (o.date < fromIso || o.date > toIso) continue;
    const yearAgo = valueOnOrBefore(obs, daysBefore(o.date, 365));
    if (!yearAgo) continue;
    const y = pctChange(o.value, yearAgo.value);
    if (y !== null) yoys.push(y);
  }
  if (yoys.length === 0) return null;
  return round(yoys.reduce((a, v) => a + v, 0) / yoys.length, 2);
}

export function computeNominalGrowth(
  gdpObs: MacroObservation[],
  runDate: string,
): NominalGrowthSnapshot {
  const latest = latestObs(gdpObs);
  if (!latest) {
    return {
      runDate, asOf: null, yoy: null, trend0307: null, trend1519: null,
      gapToRecentTrend: null, aboveTrend: null,
      headline: "Awaiting nominal GDP.",
    };
  }

  const yearAgo = valueOnOrBefore(gdpObs, daysBefore(latest.date, 365));
  const raw = yearAgo ? pctChange(latest.value, yearAgo.value) : null;
  const yoy = raw === null ? null : round(raw, 2);
  const trend0307 = meanYoyOver(gdpObs, "2003-01-01", "2007-12-31");
  const trend1519 = meanYoyOver(gdpObs, "2015-01-01", "2019-12-31");
  const gap = yoy !== null && trend1519 !== null ? round(yoy - trend1519, 2) : null;

  const headline =
    yoy === null
      ? "Awaiting nominal GDP."
      : gap === null
        ? `Nominal GDP ${yoy.toFixed(1)}% YoY — trend baseline pending.`
        : gap > 0
          ? `Nominal GDP ${yoy.toFixed(1)}% YoY — ${gap.toFixed(1)}pp above its 2015–19 trend.`
          : `Nominal GDP ${yoy.toFixed(1)}% YoY — ${Math.abs(gap).toFixed(1)}pp below its 2015–19 trend.`;

  return {
    runDate,
    asOf: latest.date,
    yoy,
    trend0307,
    trend1519,
    gapToRecentTrend: gap,
    aboveTrend: gap === null ? null : gap > 0,
    headline,
  };
}

/* ── Liquidity stress (the asset-neutral composite) ───────────────
   Eight legs → 0..1 "how tight / how fast is capital repricing",
   equal-weighted over whichever are live. Level legs use fixed,
   documented scales (same posture as computeMacroPressure); vol legs
   are percentiled against their own trailing year.

   Higher score = tighter liquidity = higher required return = the
   condition under which Dale's risk-premium correction happens. */

const VOL_WINDOW = 20; // sessions in each realized-vol reading
const VOL_HISTORY = 252; // trailing readings the percentile ranks against
const BOND_VOL_BREAKOUT = 0.8; // percentile that counts as "broke out"

export function computeLiquidityStress(
  panel: MacroSeries[],
  globalBonds: GlobalBondRead | null,
  runDate: string,
): LiquidityStressSnapshot {
  const legs: LiquidityLeg[] = [];

  // 1 · Rates — the level of the global discount rate, and how fast it
  // is moving. 10y yield 60d change: −0.5pp→0, +0.5pp→1.
  const dgs10 = seriesFor(panel, "rates_10y");
  const rateLatest = latestObs(dgs10);
  const rateThen = rateLatest ? valueOnOrBefore(dgs10, daysBefore(rateLatest.date, 60)) : null;
  const rateChg = rateLatest && rateThen ? rateLatest.value - rateThen.value : null;
  legs.push({
    key: "rates_10y_chg",
    label: "10y yield (60d Δ)",
    value: rateChg === null ? null : round(rateChg, 2),
    normalized: rateChg === null ? null : round(clamp01((rateChg + 0.5) / 1.0), 4),
    note: "pp · −0.5→0, +0.5→1",
    source: "fred",
  });

  // 2 · Bond volatility — the MOVE stand-in. Realized σ of daily 10y
  // yield CHANGES, percentiled against its own trailing year. This is
  // the leg Dale calls the tell.
  const bondVol = realizedVol(dgs10, VOL_WINDOW, "diff");
  const bondVolHist = rollingVol(dgs10, VOL_WINDOW, "diff", VOL_HISTORY);
  const bondVolPct = bondVol === null ? null : percentileRank(bondVolHist, bondVol);
  legs.push({
    key: "bond_vol",
    label: "Bond vol (MOVE proxy)",
    // reported in basis points — the unit the desk thinks in
    value: bondVol === null ? null : round(bondVol * 100, 1),
    normalized: bondVolPct === null ? null : round(bondVolPct, 4),
    note: "σ of daily 10y Δ, 20d · 1y percentile",
    source: "derived",
  });

  // 3 · Currency volatility — same treatment on the broad dollar.
  const usd = seriesFor(panel, "dollar_broad");
  const fxVol = realizedVol(usd, VOL_WINDOW, "pct");
  const fxVolHist = rollingVol(usd, VOL_WINDOW, "pct", VOL_HISTORY);
  const fxVolPct = fxVol === null ? null : percentileRank(fxVolHist, fxVol);
  legs.push({
    key: "fx_vol",
    label: "Currency vol",
    value: fxVol === null ? null : round(fxVol, 3),
    normalized: fxVolPct === null ? null : round(fxVolPct, 4),
    note: "σ of daily broad-USD %Δ, 20d · 1y percentile",
    source: "derived",
  });

  // 4 · Equity volatility — completes the vol triangle. Fixed scale:
  // VIX 12→0, 32→1 (a level whose meaning has been stable).
  const vix = latestObs(seriesFor(panel, "vol_equity"));
  legs.push({
    key: "equity_vol",
    label: "Equity vol (VIX)",
    value: vix ? round(vix.value, 2) : null,
    normalized: vix ? round(clamp01((vix.value - 12) / 20), 4) : null,
    note: "level · 12→0, 32→1",
    source: "fred",
  });

  // 5 · Credit — HY OAS. Same scale as the oil pressure engine uses,
  // deliberately: it is the same underlying claim about risk appetite.
  const oas = latestObs(seriesFor(panel, "credit_hy_oas"));
  legs.push({
    key: "credit_hy_oas",
    label: "HY OAS",
    value: oas ? round(oas.value, 2) : null,
    normalized: oas ? round(clamp01((oas.value - 3) / 5), 4) : null,
    note: "level · 3%→0, 8%→1",
    source: "fred",
  });

  // 6 · Curve — inversion as a growth/funding-stress signal.
  const curve = latestObs(seriesFor(panel, "curve_10y2y"));
  legs.push({
    key: "curve_10y2y",
    label: "10y–2y spread",
    value: curve ? round(curve.value, 2) : null,
    normalized: curve ? round(clamp01((1.0 - curve.value) / 2.0), 4) : null,
    note: "level · +1.0→0, −1.0→1",
    source: "fred",
  });

  // 7 · Fed net liquidity — 13-week %change. Contracting = stress.
  // +3%→0, −3%→1.
  const netLiq = netLiquiditySeries(panel);
  const nlLatest = latestObs(netLiq);
  const nlThen = nlLatest ? valueOnOrBefore(netLiq, daysBefore(nlLatest.date, 91)) : null;
  const nlChg = nlLatest && nlThen ? pctChange(nlLatest.value, nlThen.value) : null;
  legs.push({
    key: "net_liquidity",
    label: "Fed net liquidity (13w)",
    value: nlChg === null ? null : round(nlChg, 2),
    normalized: nlChg === null ? null : round(clamp01((3 - nlChg) / 6), 4),
    note: "%chg · +3%→0, −3%→1",
    source: "fred",
  });

  // 8 · Global bond stress — international sovereign 1m return. The
  // live stand-in for the global IG yield surge. +2%→0, −2%→1.
  legs.push({
    key: "global_bonds",
    label: "Global govt bonds (1m)",
    value: globalBonds?.return1m ?? null,
    normalized:
      globalBonds?.return1m == null
        ? null
        : round(clamp01((2 - globalBonds.return1m) / 4), 4),
    note: globalBonds ? `${globalBonds.symbol} · %chg · +2%→0, −2%→1` : "%chg · +2%→0, −2%→1",
    source: "yahoo",
  });

  const live = legs.filter((l) => l.normalized !== null);
  const available = live.length;
  const total = legs.length;

  // Four legs is the floor: below that the composite is one or two
  // indicators wearing a score's clothing.
  if (available < 4) {
    return {
      runDate,
      score: null,
      status: "insufficient",
      riskPremiumAlert: false,
      headline: `Awaiting liquidity inputs — ${available}/${total} legs live.`,
      legs,
      coverage: { available, total },
    };
  }

  const composite = live.reduce((a, l) => a + (l.normalized as number), 0) / available;
  const score = Math.round(clamp01(composite) * 100);
  const status = score >= 66 ? "elevated" : score <= 33 ? "muted" : "normal";

  // The 1998-style setup needs BOTH: an elevated composite (capital is
  // repricing) and a bond-vol breakout (it is repricing disorderly).
  // Either alone is a level read, not a correction thesis.
  const riskPremiumAlert = score >= 60 && bondVolPct !== null && bondVolPct >= BOND_VOL_BREAKOUT;

  const headline = riskPremiumAlert
    ? `Risk-premium repricing — liquidity stress ${score}/100 with bond vol at the ${Math.round(
        (bondVolPct as number) * 100,
      )}th percentile.`
    : `Liquidity stress ${score}/100 · ${available}/${total} legs live.`;

  return {
    runDate,
    score,
    status,
    riskPremiumAlert,
    headline,
    legs,
    coverage: { available, total },
  };
}

/* ── Macro pressure (Macro Override half) ─────────────────────────
   Each leg → 0..1 headwind-for-oil, on a fixed documented scale.
   UNCHANGED by the macro refresh: the Oil Tracker's Macro Override
   chip reads this, and generalising it would have regressed a working
   module. computeLiquidityStress above is the asset-neutral one. */

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
