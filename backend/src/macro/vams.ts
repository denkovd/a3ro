/* ────────────────────────────────────────────────────────────────
   VAMS + Global Macro Risk Matrix — the TOP-DOWN layer.

   The GRID (macro/engine.ts) answers "what regime is the ECONOMY in"
   from IP and CPI rate-of-change. This module answers the other half:
   "what regime is the MARKET PRICING", by scoring each market in the
   cross-asset universe with a volatility-adjusted momentum signal and
   aggregating those states into per-regime confirmation shares.

   The two layers are kept separate on purpose. When the economy reads
   Reflation and the market is confirming Deflation, that disagreement
   IS the signal — averaging them would destroy the only interesting
   thing the pair tells you.

   VAMS (see docs/regime-macro-refresh.md §3.1):

       z = r_n / (σ_daily × √n)

   the n-session log return divided by what n sessions of that market's
   own daily noise would produce — a t-statistic of the drift, i.e.
   momentum already adjusted for volatility. Bullish above +0.5σ,
   bearish below −0.5σ, neutral in between.

   The framework's VAMS also reads volume. Dropped here, deliberately: Yahoo
   volume is unreliable-to-absent for FX pairs and continuous futures,
   so a volume leg would be present for equities/ETFs and missing for a
   third of the universe — biasing the matrix toward whichever assets
   happen to report it. Better a documented omission than a lopsided
   input.

   No IO: bars come from market_bars via the caller.
──────────────────────────────────────────────────────────────── */

import { RegimeBar } from "../regime/types";
import { MacroQuadrant } from "./types";
import { REGIME_AFFINITY_DERIVED } from "./regimeAffinity.generated";

export type VamsState = "BULLISH" | "BEARISH" | "NEUTRAL" | "PENDING";

/** Regimes a market confirms when bullish / when bearish. Empty = this
 *  state carries no clean regime information for that asset, so it
 *  contributes nothing rather than being forced into a bucket. */
type Affinity = {
  bullish: Exclude<MacroQuadrant, "PENDING">[];
  bearish: Exclude<MacroQuadrant, "PENDING">[];
};

/**
 * Cross-asset regime affinity — which GRID regimes a market's trend
 * state confirms.
 *
 * This is the HAND-WRITTEN baseline. `affinityBacktest.ts` derives the
 * same table empirically (lift of each regime's conditional
 * probability under each state, over ~25 years of labelled months),
 * and `affinityFor()` below prefers the derived entry wherever one
 * exists. This table remains the fallback for assets with too little
 * history to condition on — crypto majors, mostly — and as the
 * reference to diff a regeneration against.
 *
 * Reasoning, since these are judgement calls and should be arguable
 * rather than magic:
 *
 * - Equities bullish = risk-on (Goldilocks + Reflation). Nasdaq skews
 *   Goldilocks (long-duration growth wants cooling inflation); Russell
 *   and DAX skew Reflation (cyclical, domestic, value-tilted).
 * - Treasuries are PRICE series: TLT/IEF bullish = yields falling =
 *   Deflation, or Goldilocks when growth holds up.
 * - Credit (HYG) bullish = risk appetite intact = Goldilocks/Reflation.
 * - Industrial commodities bullish = Reflation/Inflation.
 * - Gold and silver bullish = Inflation (debasement/hedge bid) and
 *   Deflation (real-yield collapse, haven) — gold is the one asset
 *   that genuinely confirms both risk-off regimes.
 * - Broad dollar bullish = risk-off (Deflation) or tightening
 *   (Inflation); the crosses are its mirror. USD/JPY is the exception:
 *   yen weakness is a carry/risk-on tell, so it maps like a risk asset.
 * - Crypto is a liquidity-beta proxy: bullish = Goldilocks/Reflation.
 * - Natural gas is weather-dominated more than macro-dominated, so it
 *   confirms nothing. Listed explicitly so its absence is a decision,
 *   not an oversight.
 */
export const REGIME_AFFINITY: Record<string, Affinity> = {
  // equity indices
  "^GSPC": { bullish: ["GOLDILOCKS", "REFLATION"], bearish: ["INFLATION", "DEFLATION"] },
  "^NDX": { bullish: ["GOLDILOCKS"], bearish: ["INFLATION", "DEFLATION"] },
  "^DJI": { bullish: ["GOLDILOCKS", "REFLATION"], bearish: ["INFLATION", "DEFLATION"] },
  "^RUT": { bullish: ["REFLATION"], bearish: ["DEFLATION"] },
  "^GDAXI": { bullish: ["REFLATION"], bearish: ["DEFLATION"] },
  "^N225": { bullish: ["REFLATION"], bearish: ["DEFLATION"] },
  "^HSI": { bullish: ["REFLATION"], bearish: ["DEFLATION"] },

  // rates & credit (price series — bullish = yields down)
  TLT: { bullish: ["DEFLATION", "GOLDILOCKS"], bearish: ["REFLATION", "INFLATION"] },
  IEF: { bullish: ["DEFLATION", "GOLDILOCKS"], bearish: ["REFLATION", "INFLATION"] },
  HYG: { bullish: ["GOLDILOCKS", "REFLATION"], bearish: ["DEFLATION", "INFLATION"] },

  // metals
  "GC=F": { bullish: ["INFLATION", "DEFLATION"], bearish: ["GOLDILOCKS"] },
  "SI=F": { bullish: ["INFLATION", "REFLATION"], bearish: ["DEFLATION"] },
  "HG=F": { bullish: ["REFLATION"], bearish: ["DEFLATION"] },
  "PL=F": { bullish: ["REFLATION"], bearish: ["DEFLATION"] },

  // energy & ags
  "CL=F": { bullish: ["REFLATION", "INFLATION"], bearish: ["DEFLATION", "GOLDILOCKS"] },
  "BZ=F": { bullish: ["REFLATION", "INFLATION"], bearish: ["DEFLATION", "GOLDILOCKS"] },
  "NG=F": { bullish: [], bearish: [] }, // weather-led, not macro-led
  "ZW=F": { bullish: ["INFLATION"], bearish: ["DEFLATION"] },

  // FX
  "DX-Y.NYB": { bullish: ["DEFLATION", "INFLATION"], bearish: ["REFLATION", "GOLDILOCKS"] },
  "EURUSD=X": { bullish: ["REFLATION", "GOLDILOCKS"], bearish: ["DEFLATION", "INFLATION"] },
  "GBPUSD=X": { bullish: ["REFLATION", "GOLDILOCKS"], bearish: ["DEFLATION", "INFLATION"] },
  "AUDUSD=X": { bullish: ["REFLATION"], bearish: ["DEFLATION"] }, // the cyclical cross
  "USDJPY=X": { bullish: ["REFLATION", "GOLDILOCKS"], bearish: ["DEFLATION"] }, // carry on/off

  // crypto — liquidity beta
  "BTC-USD": { bullish: ["GOLDILOCKS", "REFLATION"], bearish: ["DEFLATION"] },
  "ETH-USD": { bullish: ["GOLDILOCKS", "REFLATION"], bearish: ["DEFLATION"] },
  "SOL-USD": { bullish: ["GOLDILOCKS", "REFLATION"], bearish: ["DEFLATION"] },
  "BNB-USD": { bullish: ["GOLDILOCKS", "REFLATION"], bearish: ["DEFLATION"] },
  "XRP-USD": { bullish: ["GOLDILOCKS", "REFLATION"], bearish: ["DEFLATION"] },

  // commodity-linked equities
  GDX: { bullish: ["INFLATION"], bearish: ["GOLDILOCKS"] },
  XLE: { bullish: ["REFLATION", "INFLATION"], bearish: ["DEFLATION"] },
};

export const VAMS_WINDOW = 63; // ~3 months of sessions
export const VAMS_THRESHOLD = 0.5; // ±σ of the drift's own noise

export type AffinityTable = Record<string, Affinity>;

/**
 * Affinity for a symbol: the backtest-derived entry when one exists,
 * otherwise the hand-written baseline, otherwise nothing (an unmapped
 * symbol scores a state but confirms no regime).
 *
 * The derived table is generated by `npm run backtest:affinity` into
 * regimeAffinity.generated.ts, which is committed with an empty table
 * so this is a plain static import — no dynamic loading, no optional
 * module, and a fresh checkout that has never run the backtest simply
 * falls through to the reasoned table.
 *
 * `override` is a test seam.
 */
export function affinityFor(symbol: string, override?: AffinityTable): Affinity {
  const derived = override ?? REGIME_AFFINITY_DERIVED;
  return derived[symbol] ?? REGIME_AFFINITY[symbol] ?? { bullish: [], bearish: [] };
}

export interface VamsRead {
  symbol: string;
  displayName: string;
  state: VamsState;
  /** The vol-adjusted momentum t-stat itself. */
  z: number | null;
  /** Raw n-session return, %, for display alongside the score. For
   *  back-adjusted futures this is the rolled-position return (price
   *  changes over the real traded level), which includes roll yield. */
  return63: number | null;
  /** Spot n-session change of the continuous contract as traded, %.
   *  Only set when raw levels were supplied. This is the number to quote
   *  to readers ("WTI is up X% in three months"). It differs from
   *  return63 for futures by the roll gaps the window spans. */
  spotReturn63?: number | null;
  asOf: string | null;
  /** Regimes this read confirms, given its state. */
  confirms: Exclude<MacroQuadrant, "PENDING">[];
}

export interface RiskMatrixSnapshot {
  runDate: string;
  /** Regime with the largest confirmation share, or PENDING. */
  modalRegime: MacroQuadrant;
  /** 0..1 per regime, summing to ~1 across the four. */
  shares: Record<Exclude<MacroQuadrant, "PENDING">, number>;
  /** Markets confirming each regime — the raw count behind the share. */
  counts: Record<Exclude<MacroQuadrant, "PENDING">, number>;
  /** Share of the universe that is risk-on (Goldilocks + Reflation). */
  riskOnShare: number | null;
  reads: VamsRead[];
  scored: number; // markets with a live VAMS state
  universe: number; // markets attempted
  headline: string;
}

/** Population σ of daily log returns over the last `window` bars. */
export function dailyLogVol(bars: RegimeBar[], window: number): number | null {
  if (bars.length < window + 1) return null;
  const slice = bars.slice(-(window + 1));
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].close;
    const cur = slice[i].close;
    if (prev <= 0 || cur <= 0) return null; // log-return undefined
    rets.push(Math.log(cur / prev));
  }
  const mean = rets.reduce((a, r) => a + r, 0) / rets.length;
  const varr = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
  return Math.sqrt(varr);
}

/**
 * VAMS for one market. Returns PENDING (not NEUTRAL) when history is
 * short or vol is degenerate — "we don't know" and "no trend" are
 * different answers and must not collapse into one another, or a
 * thinly-listed market silently votes for nothing while looking scored.
 */
/**
 * Daily simple returns of an adjusted series measured against the REAL
 * traded level. Additive back-adjustment (bull/rolls.ts) preserves
 * price DIFFERENCES but shifts old LEVELS, so dividing by an adjusted
 * level inflates percentages after a run of negative roll gaps (steep
 * backwardation pushes old adjusted prices far below where the market
 * traded). Using adj differences over raw levels is the standard fix.
 * Without `levels` (or for a date raw lacks) the level is the bar's own
 * close, which reduces exactly to close/prev − 1.
 */
function levelOf(bars: RegimeBar[], levels: Map<string, number> | null): (i: number) => number {
  return (i: number) => {
    const raw = levels?.get(bars[i].date);
    return raw !== undefined && raw > 0 ? raw : bars[i].close;
  };
}

function leveledLogVol(bars: RegimeBar[], window: number, level: (i: number) => number): number | null {
  if (bars.length < window + 1) return null;
  const start = bars.length - (window + 1);
  const rets: number[] = [];
  for (let i = start + 1; i < bars.length; i++) {
    const base = level(i - 1);
    if (base <= 0) return null;
    const r = (bars[i].close - bars[i - 1].close) / base;
    if (r <= -1) return null; // log-return undefined
    rets.push(Math.log(1 + r));
  }
  const mean = rets.reduce((a, r) => a + r, 0) / rets.length;
  const varr = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
  return Math.sqrt(varr);
}

export function computeVams(
  bars: RegimeBar[],
  symbol: string,
  displayName: string,
  opts: { window?: number; threshold?: number; levels?: RegimeBar[] } = {},
): VamsRead {
  const window = opts.window ?? VAMS_WINDOW;
  const threshold = opts.threshold ?? VAMS_THRESHOLD;
  const affinity = affinityFor(symbol);
  const base: VamsRead = {
    symbol, displayName, state: "PENDING", z: null, return63: null,
    asOf: bars.length ? bars[bars.length - 1].date : null, confirms: [],
  };

  const levelMap = opts.levels && opts.levels.length > 0
    ? new Map(opts.levels.map((b) => [b.date, b.close] as const))
    : null;
  const level = levelOf(bars, levelMap);

  const sigma = leveledLogVol(bars, window, level);
  if (sigma === null || sigma === 0) return base;

  const lastIdx = bars.length - 1;
  const thenIdx = lastIdx - window;
  const last = bars[lastIdx];
  const then = bars[thenIdx];
  if (!then || then.close <= 0 || last.close <= 0) return base;

  const thenLevel = level(thenIdx);
  const simple = (last.close - then.close) / thenLevel;
  if (simple <= -1) return base;
  const r = Math.log(1 + simple);
  const z = r / (sigma * Math.sqrt(window));
  const state: VamsState = z >= threshold ? "BULLISH" : z <= -threshold ? "BEARISH" : "NEUTRAL";

  let spotReturn63: number | null | undefined;
  if (levelMap) {
    const rawLast = levelMap.get(last.date);
    const rawThen = levelMap.get(then.date);
    spotReturn63 = rawLast !== undefined && rawThen !== undefined && rawThen > 0
      ? Math.round(((rawLast - rawThen) / rawThen) * 10_000) / 100
      : null;
  }

  return {
    ...base,
    state,
    z: Math.round(z * 1000) / 1000,
    return63: Math.round(simple * 10_000) / 100,
    ...(spotReturn63 !== undefined ? { spotReturn63 } : {}),
    confirms: state === "BULLISH" ? affinity.bullish : state === "BEARISH" ? affinity.bearish : [],
  };
}

const REGIMES: Exclude<MacroQuadrant, "PENDING">[] = [
  "GOLDILOCKS",
  "REFLATION",
  "INFLATION",
  "DEFLATION",
];

const zeroed = (): Record<Exclude<MacroQuadrant, "PENDING">, number> => ({
  GOLDILOCKS: 0, REFLATION: 0, INFLATION: 0, DEFLATION: 0,
});

/**
 * Aggregate VAMS reads into regime confirmation shares.
 *
 * Each market carries ONE point, split evenly across the regimes it
 * confirms — so a market confirming two regimes gives 0.5 to each
 * rather than 1 to each. Without the split, assets with two-regime
 * affinities would count double and the matrix would silently
 * over-weight them.
 *
 * Markets that are neutral, pending, or have no affinity for their
 * current state contribute no points at all: a market saying nothing
 * should not dilute the markets that are saying something.
 */
export function computeRiskMatrix(reads: VamsRead[], runDate: string): RiskMatrixSnapshot {
  const counts = zeroed();
  const points = zeroed();
  let totalPoints = 0;

  for (const r of reads) {
    if (r.confirms.length === 0) continue;
    const each = 1 / r.confirms.length;
    for (const regime of r.confirms) {
      counts[regime] += 1;
      points[regime] += each;
      totalPoints += each;
    }
  }

  const scored = reads.filter((r) => r.state === "BULLISH" || r.state === "BEARISH" || r.state === "NEUTRAL").length;
  const shares = zeroed();

  if (totalPoints === 0) {
    return {
      runDate,
      modalRegime: "PENDING",
      shares,
      counts,
      riskOnShare: null,
      reads,
      scored,
      universe: reads.length,
      headline: `No market is confirming a regime — ${scored}/${reads.length} scored.`,
    };
  }

  for (const regime of REGIMES) {
    shares[regime] = Math.round((points[regime] / totalPoints) * 10_000) / 10_000;
  }

  let modal: Exclude<MacroQuadrant, "PENDING"> = REGIMES[0];
  for (const regime of REGIMES) if (shares[regime] > shares[modal]) modal = regime;

  const riskOnShare = Math.round((shares.GOLDILOCKS + shares.REFLATION) * 10_000) / 10_000;
  const pct = (v: number) => Math.round(v * 100);

  return {
    runDate,
    modalRegime: modal,
    shares,
    counts,
    riskOnShare,
    reads,
    scored,
    universe: reads.length,
    headline: `Market is pricing ${modal.charAt(0) + modal.slice(1).toLowerCase()} — ${pct(
      shares[modal],
    )}% of confirmations, ${pct(riskOnShare)}% risk-on, ${scored}/${reads.length} markets scored.`,
  };
}
