/* ────────────────────────────────────────────────────────────────
   Scenario engine — pure, deterministic, no IO.

   Turns a pressure-tested thesis + MarketContext into five scenarios:
   bear tail / bear / base / bull / bull tail, ordered DOWNSIDE FIRST
   (the product rule: surface what hurts before what pays).

   Anchoring, honestly:
   • Price legs sit at fixed σ-multiples of the instrument's own
     realized volatility over the thesis horizon (√t scaling of the
     daily log-return σ). No drift is assumed — "base" is flat, which
     is itself a documented modeling choice, not a forecast.
   • Probabilities are EMPIRICAL FREQUENCIES: the fraction of trailing
     horizon-length windows whose realized return landed in each
     scenario's bucket. Where the series is too short, probability is
     null and the UI says so. They are descriptions of the past
     distribution, never predictions — the basis string spells it out.
   • Tail narratives are instantiated from the live context (crowded
     positioning → unwind tail; elevated macro pressure / DEFLATION →
     macro-shock tail; tight tape → supply-shock melt-up), so the
     tails read like this market's tails, not stock photos.

   Assumption tracing: every scenario re-evaluates each assumption
   (holds / stressed / breaks) with a WHY, so scenario damage is
   traceable back to the exact legs that failed — Phase 2's product
   requirement.
──────────────────────────────────────────────────────────────── */

import { Assumption, MarketContext, Scenario, ScenarioId, ScenarioSet, ThesisAnalysis } from "./types";

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** σ-multiples per scenario — fixed, documented. Tails at 2.5σ ≈ the
 *  ~1% weekly-tail zone of a normal; real markets are fatter, which
 *  the empirical probabilities capture better than the label. */
export const SCENARIO_SIGMA: Record<ScenarioId, number> = {
  bear_tail: -2.5,
  bear: -1.25,
  base: 0,
  bull: 1.25,
  bull_tail: 2.5,
};

const ORDER: ScenarioId[] = ["bear_tail", "bear", "base", "bull", "bull_tail"];

const NAME: Record<ScenarioId, string> = {
  bear_tail: "Bear tail",
  bear: "Bear",
  base: "Base",
  bull: "Bull",
  bull_tail: "Bull tail",
};

/** Trading days in a calendar horizon (≈252/365). */
export function tradingDaysIn(horizonDays: number): number {
  return Math.max(5, Math.round(horizonDays * (252 / 365)));
}

/** Overlapping horizon-length log returns from a close series. */
export function horizonReturns(closes: number[], horizonTradingDays: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + horizonTradingDays < closes.length; i++) {
    const a = closes[i];
    const b = closes[i + horizonTradingDays];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

/** Empirical bucket frequencies for the five scenarios, from the
 *  distribution of horizon returns. Buckets split at the midpoints
 *  between adjacent σ-legs (−1.875σ, −0.625σ, +0.625σ, +1.875σ). */
export function empiricalProbabilities(
  returns: number[],
  sigmaH: number,
): Record<ScenarioId, number> | null {
  if (returns.length < 30 || sigmaH <= 0) return null;
  const cuts = [-1.875 * sigmaH, -0.625 * sigmaH, 0.625 * sigmaH, 1.875 * sigmaH];
  const counts: Record<ScenarioId, number> = { bear_tail: 0, bear: 0, base: 0, bull: 0, bull_tail: 0 };
  for (const r of returns) {
    if (r < cuts[0]) counts.bear_tail++;
    else if (r < cuts[1]) counts.bear++;
    else if (r <= cuts[2]) counts.base++;
    else if (r <= cuts[3]) counts.bull++;
    else counts.bull_tail++;
  }
  const n = returns.length;
  const out = {} as Record<ScenarioId, number>;
  for (const id of ORDER) out[id] = counts[id] / n;
  return out;
}

/* ── narrative instantiation from live context ────────────────── */

function tailNarratives(ctx: MarketContext, direction: "long" | "short" | "neutral"): { bear: string; bull: string } {
  const crowdedLong = ctx.positioning?.stance === "CROWDED_LONG";
  const crowdedShort = ctx.positioning?.stance === "CROWDED_SHORT";
  const macroHot = (ctx.macro?.pressureScore ?? 0) >= 60 || ctx.macro?.quadrant === "DEFLATION";
  const tapeTight = ctx.tape?.stance === "SUPPLY_TIGHT";
  const tapeAmple = ctx.tape?.stance === "SUPPLY_AMPLE";

  let bear: string;
  if (crowdedLong && ctx.oilAdjacent) {
    bear = `Crowded-long unwind: managed money is stretched (${ctx.positioning ? `${Math.round((ctx.positioning.percentile1y ?? 0) * 100)}th pctile net length` : "COT stretched"}) — a disappointment forces mechanical selling into a thin bid. Flow, not fundamentals, sets the low.`;
  } else if (macroHot) {
    bear = `Macro shock: the backdrop is already leaning on risk (${ctx.macro ? `${ctx.macro.quadrant}, pressure ${ctx.macro.pressureScore ?? "—"}/100` : "pressure elevated"}) — a growth scare or dollar spike repricing demand assumptions all at once.`;
  } else if (tapeAmple && ctx.oilAdjacent) {
    bear = `Surplus confirmation: the tape already reads SUPPLY-AMPLE — inventory builds compound, the curve flattens into contango, and length liquidates on schedule rather than on news.`;
  } else {
    bear = `Exogenous demand shock (growth scare, credit event, dollar spike) — the kind of move that ignores positioning and fundamentals alike for its first leg.`;
  }

  let bull: string;
  if (tapeTight && ctx.oilAdjacent) {
    bull = `Supply-shock melt-up: the tape already reads SUPPLY-TIGHT — one outage or escalation and the shortage gets priced immediately, gapping past targets rather than trending to them.`;
  } else if (crowdedShort && ctx.oilAdjacent) {
    bull = `Short squeeze: managed money is crowded short — any upside catalyst forces covering, and the move feeds itself well beyond fair value.`;
  } else {
    bull = `Right-tail surprise: a supply disruption, policy pivot or demand upgrade that compresses months of repricing into days.`;
  }

  return { bear, bull };
}

function midNarratives(ctx: MarketContext): { bear: string; base: string; bull: string } {
  return {
    bear: `Orderly repricing lower — the thesis's supporting data disappoints in sequence (one bad print at a time), without a panic. The most common way a thesis dies: slowly, then all at once.`,
    base: `Nothing resolves: price chops inside its recent distribution, both bulls and bears get stopped, and the horizon expires with the thesis unproven rather than wrong. Time decay is the cost.`,
    bull: `The thesis works roughly as written — supportive data lands, the market re-rates gradually, and the position pays without ever feeling comfortable.`,
  };
}

/* ── assumption outcomes per scenario ─────────────────────────── */

function outcomeFor(a: Assumption, id: ScenarioId, thesisDirection: "long" | "short" | "neutral"): { state: "holds" | "stressed" | "breaks"; why: string } {
  const sigma = SCENARIO_SIGMA[id];
  // Which way does this scenario move relative to what the thesis needs?
  const dirSign = thesisDirection === "short" ? -1 : 1; // neutral treated as long for tracing, labeled in why
  const favorable = sigma * dirSign; // >0 = scenario helps the thesis

  // Direction/level/timing legs live and die with price.
  if (a.kind === "direction" || a.kind === "level") {
    if (favorable >= 1.25) return { state: "holds", why: "price moves the thesis's way — the directional leg is vindicated" };
    if (favorable > 0) return { state: "holds", why: "mildly favorable drift keeps the leg alive" };
    if (favorable === 0) return { state: "stressed", why: "a flat tape proves nothing — the leg survives on time, not evidence" };
    if (favorable >= -1.25 && a.fragility < 60) return { state: "stressed", why: "adverse move tests the leg; only sturdier setups survive a −1.25σ leg against" };
    if (favorable >= -1.25) return { state: "breaks", why: `adverse move against a fragile leg (fragility ${a.fragility}) — stops out before the story can rescue it` };
    return { state: "breaks", why: "tail against the thesis — the directional leg is simply wrong at this price" };
  }

  if (a.kind === "timing") {
    if (favorable >= 1.25) return { state: "holds", why: "the move arrives inside the window" };
    if (favorable > 0) return { state: "stressed", why: "partial progress — the deadline now needs the remainder faster than σ suggests" };
    return { state: "breaks", why: "any non-favorable path exhausts the clock — deadline legs cannot survive sideways, let alone adverse" };
  }

  if (a.kind === "positioning") {
    if (Math.abs(sigma) >= 2.5) return { state: "breaks", why: "tails ARE positioning events — whatever the COT said last week is gone mid-move" };
    if (favorable < 0) return { state: "stressed", why: "adverse drift usually means the expected flow showed up on the other side" };
    return { state: "holds", why: "orderly favorable move is consistent with the assumed flow arriving" };
  }

  if (a.kind === "macro") {
    if (id === "bear_tail") return { state: "breaks", why: "bear tails are macro events more often than not — the benign-backdrop leg is the first casualty" };
    if (favorable < 0) return { state: "stressed", why: "adverse drift pressures the macro leg; watch the quadrant momentum signs" };
    return { state: "holds", why: "no macro violence in this path" };
  }

  // supply / demand / causal — fundamental stories judged by fragility under stress
  if (Math.abs(sigma) >= 2.5) {
    return favorable > 0
      ? { state: "stressed", why: "even a favorable tail rewrites the fundamental story — right outcome, unproven mechanism" }
      : { state: "breaks", why: "an adverse tail means the fundamental premise was wrong or overwhelmed" };
  }
  if (favorable < 0) {
    return a.fragility >= 60
      ? { state: "breaks", why: `fragile fundamental leg (${a.fragility}) fails under sustained adverse repricing` }
      : { state: "stressed", why: "the market is voting against the premise — not yet fatal, no longer supportive" };
  }
  if (favorable === 0) return { state: "stressed", why: "sideways price means the fundamental thesis is not being paid for — yet" };
  return { state: "holds", why: "favorable path consistent with the premise" };
}

/* ── main ─────────────────────────────────────────────────────── */

export function buildScenarios(analysis: ThesisAnalysis, ctx: MarketContext): ScenarioSet {
  const horizonDays = analysis.parsed.horizonDays;
  const horizonTradingDays = tradingDaysIn(horizonDays);

  const anchor = ctx.price?.value ?? null;
  const anchorSource = ctx.price ? `${ctx.price.source} (${ctx.price.symbol}, ${ctx.price.asOf})` : "no live price on file — price legs suppressed";

  const dailySigma = ctx.realizedVol?.dailySigma ?? null;
  const sigmaH = dailySigma !== null ? dailySigma * Math.sqrt(horizonTradingDays) : null;
  const sigmaBasis =
    dailySigma !== null && ctx.realizedVol
      ? `realized daily σ ${(dailySigma * 100).toFixed(2)}% over ${ctx.realizedVol.observations} sessions × √${horizonTradingDays} trading days = ±${((sigmaH as number) * 100).toFixed(1)}% per 1σ`
      : "no return series on file — σ legs suppressed";

  const closes = ctx.priceSeries.map((p) => p.close);
  const rets = sigmaH !== null ? horizonReturns(closes, horizonTradingDays) : [];
  const probs = sigmaH !== null ? empiricalProbabilities(rets, sigmaH) : null;
  const probabilityNote = probs
    ? `Empirical frequencies of ${rets.length} overlapping ${horizonTradingDays}-session windows in the trailing series — how often the past landed in each bucket, NOT a forecast.`
    : `Probability column suppressed — needs ≥30 horizon-length windows on file (have ${rets.length}).`;

  const tails = tailNarratives(ctx, analysis.parsed.direction);
  const mids = midNarratives(ctx);
  const narrative: Record<ScenarioId, string> = {
    bear_tail: tails.bear,
    bear: mids.bear,
    base: mids.base,
    bull: mids.bull,
    bull_tail: tails.bull,
  };

  const dirSign = analysis.parsed.direction === "short" ? -1 : analysis.parsed.direction === "long" ? 1 : 0;

  const scenarios: Scenario[] = ORDER.map((id) => {
    const sigma = SCENARIO_SIGMA[id];
    const movePct = sigmaH !== null ? (Math.exp(sigma * sigmaH) - 1) * 100 : null;
    const price = anchor !== null && movePct !== null ? anchor * (1 + movePct / 100) : null;
    const thesisPnlPct = movePct !== null && dirSign !== 0 ? movePct * dirSign : dirSign === 0 ? null : null;

    const outcomes = analysis.assumptions.map((a) => {
      const o = outcomeFor(a, id, analysis.parsed.direction);
      return { assumptionId: a.id, state: o.state, why: o.why };
    });
    const broken = outcomes.filter((o) => o.state === "breaks").length;
    const stressed = outcomes.filter((o) => o.state === "stressed").length;

    const impact =
      dirSign === 0
        ? `No direction declared — ${broken} assumption${broken === 1 ? "" : "s"} break here regardless.`
        : thesisPnlPct === null
          ? `${broken} of ${outcomes.length} assumptions break; ${stressed} stressed.`
          : thesisPnlPct > 0
            ? `Thesis pays ${thesisPnlPct.toFixed(1)}% — but ${broken > 0 ? `${broken} leg${broken === 1 ? "" : "s"} still break (right for fewer reasons than written)` : "with its legs intact"}.`
            : thesisPnlPct === 0
              ? `Flat: the thesis survives unproven; ${stressed} legs stressed by the clock.`
              : `Thesis loses ${Math.abs(thesisPnlPct).toFixed(1)}% — ${broken} leg${broken === 1 ? "" : "s"} broken: ${outcomes
                  .filter((o) => o.state === "breaks")
                  .slice(0, 3)
                  .map((o) => analysis.assumptions.find((a) => a.id === o.assumptionId)?.kind ?? "?")
                  .join(", ")}.`;

    return {
      id,
      name: NAME[id],
      narrative: narrative[id],
      sigma,
      price: price !== null ? Math.round(price * 100) / 100 : null,
      movePct: movePct !== null ? Math.round(movePct * 10) / 10 : null,
      probability: probs ? Math.round(probs[id] * 1000) / 1000 : null,
      probabilityBasis: probs ? `empirical: ${(probs[id] * 100).toFixed(1)}% of trailing windows` : "insufficient history",
      thesisPnlPct: thesisPnlPct !== null ? Math.round(thesisPnlPct * 10) / 10 : null,
      assumptionOutcomes: outcomes,
      thesisImpact: impact,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    instrument: analysis.parsed.instrument,
    anchorPrice: anchor,
    anchorSource,
    horizonDays,
    horizonTradingDays,
    horizonSigma: sigmaH !== null ? Math.round(sigmaH * 10000) / 10000 : null,
    sigmaBasis,
    scenarios,
    probabilityNote,
  };
}

/** Convenience: clamp helper is exported for the risk engine's reuse. */
export { clamp as clamp01Range };
