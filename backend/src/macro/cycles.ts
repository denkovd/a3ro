/* ────────────────────────────────────────────────────────────────
   The six macro cycles — Dale's third layer.

   Growth, inflation, POLICY, CORPORATE PROFITS, liquidity, positioning.
   Not the six the page previously showed: it split policy into separate
   monetary and fiscal tiles and had no corporate profits cycle at all,
   which is a whole cycle missing from a six-cycle model.

   What the cycles are FOR: judging whether the current dominant regime
   is sustainable. Dale's own example — early 2026, four of six cycles
   (policy, liquidity, positioning) headwinds while growth and inflation
   stayed tailwinds ⇒ elevated near-term correction risk, constructive
   medium-term once positioning washed out. So each cycle is scored
   tailwind/neutral/headwind FOR RISK ASSETS, and the count of headwinds
   is the sustainability read.

   Every threshold below is a named constant next to its use, and every
   cycle degrades to NEUTRAL/"pending" rather than guessing when its
   series is missing.

   Pure functions, no IO.
──────────────────────────────────────────────────────────────── */

import { MacroObservation, MacroSeries } from "../sources/fredMacro";
import { RegimeBar } from "../regime/types";
import { daysBefore, latestObs, pctChange, valueOnOrBefore } from "../core/seriesMath";
import { yoyAndMomentum } from "./engine";
import { CycleRead, CycleScore, SixCyclesSnapshot } from "./types";

function seriesFor(panel: MacroSeries[], key: string): MacroObservation[] {
  return panel.find((s) => s.key === key)?.observations ?? [];
}
function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

/* ── 1 · Growth ───────────────────────────────────────────────────
   Accelerating real activity is a tailwind. Same IP rate-of-change
   the GRID's vertical axis uses — one number, two consumers. */
export function growthCycle(panel: MacroSeries[]): CycleRead {
  const read = yoyAndMomentum(seriesFor(panel, "growth_indpro"), 120);
  const score: CycleScore =
    read.momentum === null ? "NEUTRAL" : read.momentum >= 0 ? "TAILWIND" : "HEADWIND";
  return {
    key: "growth",
    label: "Growth",
    score,
    note: read.momentum === null ? "pending" : read.momentum >= 0 ? "accelerating" : "decelerating",
    value: read.momentum,
    source: read.momentum === null ? "brief" : "live",
    asOf: read.asOf,
  };
}

/* ── 2 · Inflation ────────────────────────────────────────────────
   Accelerating inflation is a headwind for risk assets: it compresses
   multiples and forces policy tighter. (Note this is the opposite sign
   convention to the GRID's horizontal axis, which is directional, not
   good/bad — the axis says "which way", the cycle says "help or
   hurt".) */
export function inflationCycle(panel: MacroSeries[]): CycleRead {
  const read = yoyAndMomentum(seriesFor(panel, "inflation_cpi"), 120);
  const score: CycleScore =
    read.momentum === null ? "NEUTRAL" : read.momentum >= 0 ? "HEADWIND" : "TAILWIND";
  return {
    key: "inflation",
    label: "Inflation",
    score,
    note: read.momentum === null ? "pending" : read.momentum >= 0 ? "accelerating" : "cooling",
    value: read.momentum,
    source: read.momentum === null ? "brief" : "live",
    asOf: read.asOf,
  };
}

/* ── 3 · Policy (monetary AND fiscal — ONE cycle) ─────────────────
   Monetary leg: the REAL policy rate (fed funds − CPI YoY). The
   nominal rate alone says nothing about stance — 4% funds against 2%
   inflation is restrictive, against 7% it is deeply accommodative.
   Fiscal leg: the rolling 12-month federal deficit vs the prior 12
   months. Widening deficit = fiscal impulse = tailwind (whatever it
   does to long-run solvency, which is the cost-of-capital layer's
   problem, not this one's).

   Combined: two sub-scores, +1 tailwind / −1 headwind, summed. */

const REAL_RATE_RESTRICTIVE = 1.5; // pp above zero → tightening bites
const REAL_RATE_ACCOMMODATIVE = 0.0; // pp — below zero → easy money
const FISCAL_IMPULSE_PP = 5; // % change in the 12m deficit that counts

/** Rolling 12-month sum ending at the latest observation, and the
 *  12 months before it. Monthly Treasury data is NSA and violently
 *  seasonal (April tax receipts swamp everything), so only a trailing
 *  12-month sum is comparable period to period. */
function trailing12Sum(obs: MacroObservation[]): { current: number; prior: number } | null {
  if (obs.length < 24) return null;
  const last24 = obs.slice(-24);
  const prior = last24.slice(0, 12).reduce((a, o) => a + o.value, 0);
  const current = last24.slice(12).reduce((a, o) => a + o.value, 0);
  return { current, prior };
}

export function policyCycle(panel: MacroSeries[]): CycleRead {
  const detail: NonNullable<CycleRead["detail"]> = [];
  let net = 0;
  let live = 0;
  let asOf: string | null = null;

  // monetary — real policy rate
  const ffr = latestObs(seriesFor(panel, "policy_rate"));
  const cpi = yoyAndMomentum(seriesFor(panel, "inflation_cpi"), 120);
  let realRate: number | null = null;
  if (ffr && cpi.yoy !== null) {
    realRate = round(ffr.value - cpi.yoy, 2);
    asOf = ffr.date;
    live++;
    if (realRate >= REAL_RATE_RESTRICTIVE) net -= 1;
    else if (realRate < REAL_RATE_ACCOMMODATIVE) net += 1;
  }
  detail.push({
    label: "Real policy rate",
    value: realRate,
    note:
      realRate === null
        ? "pending"
        : realRate >= REAL_RATE_RESTRICTIVE
          ? "restrictive"
          : realRate < REAL_RATE_ACCOMMODATIVE
            ? "accommodative"
            : "neutral",
  });

  // fiscal — 12m rolling deficit vs prior 12m. MTSDS133FMS is signed
  // (deficit negative), so a MORE negative sum is a wider deficit.
  const fiscal = trailing12Sum(seriesFor(panel, "fiscal_balance"));
  let deficitChg: number | null = null;
  if (fiscal && fiscal.prior !== 0) {
    // widening (more negative) → positive impulse number
    const chg = ((fiscal.current - fiscal.prior) / Math.abs(fiscal.prior)) * 100;
    deficitChg = round(-chg, 1); // sign-flip so "+" reads as "deficit widening"
    live++;
    if (deficitChg >= FISCAL_IMPULSE_PP) net += 1;
    else if (deficitChg <= -FISCAL_IMPULSE_PP) net -= 1;
  }
  detail.push({
    label: "Fiscal impulse (12m)",
    value: deficitChg,
    note:
      deficitChg === null
        ? "pending"
        : deficitChg >= FISCAL_IMPULSE_PP
          ? "deficit widening"
          : deficitChg <= -FISCAL_IMPULSE_PP
            ? "deficit narrowing"
            : "steady",
  });

  const score: CycleScore = live === 0 ? "NEUTRAL" : net > 0 ? "TAILWIND" : net < 0 ? "HEADWIND" : "NEUTRAL";
  const note =
    live === 0
      ? "pending"
      : net > 0
        ? "net easing"
        : net < 0
          ? "net tightening"
          : "mixed";

  return {
    key: "policy",
    label: "Policy",
    score,
    note,
    value: realRate,
    detail,
    source: live === 0 ? "brief" : "live",
    asOf,
  };
}

/* ── 4 · Corporate profits ────────────────────────────────────────
   The cycle the page was missing entirely. Profits YoY plus its
   momentum: expanding and accelerating is the cleanest tailwind there
   is; contracting profits are what turn a slowdown into a de-rating. */

const PROFITS_MOMENTUM_WINDOW = 200; // ~2 quarters, in days

export function profitsCycle(panel: MacroSeries[]): CycleRead {
  const obs = seriesFor(panel, "corporate_profits");
  const read = yoyAndMomentum(obs, PROFITS_MOMENTUM_WINDOW);

  let score: CycleScore = "NEUTRAL";
  let note = "pending";
  if (read.yoy !== null) {
    // Level matters as much as momentum here: profits still growing but
    // decelerating is genuinely mixed, not a headwind.
    if (read.yoy > 0 && (read.momentum ?? 0) >= 0) {
      score = "TAILWIND";
      note = "expanding, accelerating";
    } else if (read.yoy > 0) {
      score = "NEUTRAL";
      note = "expanding, decelerating";
    } else {
      score = "HEADWIND";
      note = "contracting";
    }
  }

  return {
    key: "profits",
    label: "Corporate profits",
    score,
    note,
    value: read.yoy,
    source: read.yoy === null ? "brief" : "live",
    asOf: read.asOf,
  };
}

/* ── 5 · Liquidity ────────────────────────────────────────────────
   Fed net liquidity 13-week change. Expanding = tailwind. Takes the
   already-computed net liquidity series so the number on this tile and
   the number in the liquidity-stress composite can never disagree. */

const LIQUIDITY_FLAT_BAND = 0.5; // % over 13w that counts as unchanged

export function liquidityCycle(netLiquidity: MacroObservation[]): CycleRead {
  const latest = latestObs(netLiquidity);
  const then = latest ? valueOnOrBefore(netLiquidity, daysBefore(latest.date, 91)) : null;
  const chg = latest && then ? pctChange(latest.value, then.value) : null;

  const score: CycleScore =
    chg === null ? "NEUTRAL" : chg > LIQUIDITY_FLAT_BAND ? "TAILWIND" : chg < -LIQUIDITY_FLAT_BAND ? "HEADWIND" : "NEUTRAL";

  return {
    key: "liquidity",
    label: "Liquidity",
    score,
    note:
      chg === null
        ? "pending"
        : chg > LIQUIDITY_FLAT_BAND
          ? "expanding"
          : chg < -LIQUIDITY_FLAT_BAND
            ? "contracting"
            : "flat",
    value: chg === null ? null : round(chg, 2),
    source: chg === null ? "brief" : "live",
    asOf: latest?.date ?? null,
  };
}

/* ── 6 · Positioning ──────────────────────────────────────────────
   Dale's construction, not a WTI COT read. The specific mechanic he
   describes: rolling 260-day realized volatility for equity and credit
   indices, where NEW CYCLICAL LOWS indicate vol-targeting funds are
   levering up — i.e. crowding, i.e. fragility. Low realized vol is a
   HEADWIND (contrarian), high realized vol means positioning has
   already washed out and is a TAILWIND.

   AAII bulls–bears and the NAAIM survey are the other legs Dale names.
   Neither has a free machine-readable feed, so they are absent and
   said to be absent rather than silently approximated. */

const POSITIONING_WINDOW = 260; // Dale's own window
const CROWDED_PCTILE = 0.2; // realized vol in the bottom fifth = crowded
const WASHED_OUT_PCTILE = 0.8; // top fifth = positioning cleared

/** Rolling 260-day realized vol, one reading per bar, annualized %. */
function rollingRealizedVol(bars: RegimeBar[], window: number): number[] {
  if (bars.length < window + 1) return [];
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (prev <= 0 || cur <= 0) return [];
    rets.push(Math.log(cur / prev));
  }
  const out: number[] = [];
  for (let end = window; end <= rets.length; end++) {
    const w = rets.slice(end - window, end);
    const mean = w.reduce((a, r) => a + r, 0) / w.length;
    const varr = w.reduce((a, r) => a + (r - mean) ** 2, 0) / w.length;
    out.push(Math.sqrt(varr) * Math.sqrt(252) * 100);
  }
  return out;
}

/**
 * @param equityBars ^GSPC daily bars
 * @param creditBars HYG daily bars
 * Either may be empty; the cycle scores off whichever is available.
 */
export function positioningCycle(
  equityBars: RegimeBar[],
  creditBars: RegimeBar[],
): CycleRead {
  const detail: NonNullable<CycleRead["detail"]> = [];
  const pctiles: number[] = [];
  let asOf: string | null = null;

  for (const [label, bars] of [
    ["Equity realized vol (260d)", equityBars],
    ["Credit realized vol (260d)", creditBars],
  ] as const) {
    const series = rollingRealizedVol(bars, POSITIONING_WINDOW);
    if (series.length < 2) {
      detail.push({ label, value: null, note: "pending" });
      continue;
    }
    const current = series[series.length - 1];
    // percentile of the CURRENT reading within its own history
    const p = series.filter((v) => v <= current).length / series.length;
    pctiles.push(p);
    if (bars.length) asOf = bars[bars.length - 1].date;
    detail.push({
      label,
      value: round(current, 1),
      note:
        p <= CROWDED_PCTILE
          ? `${Math.round(p * 100)}th pctile · crowded`
          : p >= WASHED_OUT_PCTILE
            ? `${Math.round(p * 100)}th pctile · washed out`
            : `${Math.round(p * 100)}th pctile`,
    });
  }

  if (pctiles.length === 0) {
    return {
      key: "positioning", label: "Positioning", score: "NEUTRAL",
      note: "pending", value: null, detail, source: "brief", asOf: null,
    };
  }

  const mean = pctiles.reduce((a, p) => a + p, 0) / pctiles.length;
  const score: CycleScore =
    mean <= CROWDED_PCTILE ? "HEADWIND" : mean >= WASHED_OUT_PCTILE ? "TAILWIND" : "NEUTRAL";

  return {
    key: "positioning",
    label: "Positioning",
    score,
    note:
      mean <= CROWDED_PCTILE
        ? "crowded — vol-targeting levered"
        : mean >= WASHED_OUT_PCTILE
          ? "washed out"
          : "balanced",
    value: round(mean, 3),
    detail,
    source: "live",
    asOf,
  };
}

/* ── assembly ─────────────────────────────────────────────────────
   The sustainability read: how many of the six are working against
   risk assets. Dale's framing — growth and inflation can both be
   tailwinds while the other four are headwinds, which is exactly the
   "choppy near term, constructive medium term" setup. */

export function computeSixCycles(
  panel: MacroSeries[],
  netLiquidity: MacroObservation[],
  equityBars: RegimeBar[],
  creditBars: RegimeBar[],
  runDate: string,
): SixCyclesSnapshot {
  const cycles: CycleRead[] = [
    growthCycle(panel),
    inflationCycle(panel),
    policyCycle(panel),
    profitsCycle(panel),
    liquidityCycle(netLiquidity),
    positioningCycle(equityBars, creditBars),
  ];

  const tailwinds = cycles.filter((c) => c.score === "TAILWIND").length;
  const headwinds = cycles.filter((c) => c.score === "HEADWIND").length;

  const headline =
    headwinds >= 4
      ? `${headwinds} of 6 cycles are headwinds — regime sustainability is poor.`
      : headwinds === 3
        ? `3 of 6 cycles are headwinds — the regime is contested.`
        : tailwinds >= 4
          ? `${tailwinds} of 6 cycles are tailwinds — the regime is well supported.`
          : `${tailwinds} tailwind${tailwinds === 1 ? "" : "s"} / ${headwinds} headwind${
              headwinds === 1 ? "" : "s"
            } — mixed support for the current regime.`;

  return { runDate, cycles, tailwinds, headwinds, headline };
}
