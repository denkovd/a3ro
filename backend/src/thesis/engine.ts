/* ────────────────────────────────────────────────────────────────
   Thesis pressure-test engine — pure, deterministic, no IO.

   Pipeline: parse → extract explicit claims (sentence-level, kind-
   classified) → infer implied assumptions (direction/vol/trend/macro/
   positioning legs the author is standing on whether stated or not)
   → score each for confidence & fragility → cross-check against the
   live MarketContext → counter-case + kill-evidence per assumption →
   transparent overall strength.

   THE RULE THAT SHAPES EVERYTHING HERE: no number without its
   receipt. Every scoring step appends a human-readable line to
   `reasons`; every live-data comparison lands in `checks` with the
   source named; the overall strength is the SUM of listed components
   and nothing else. A reviewer can recompute any output by hand.

   Deliberately rule-based (lexicon.ts), not an LLM: scoring must be
   reproducible, offline-testable and free of invented facts. The
   trade-off (novel phrasings can slip through unscored) is documented
   in DECISIONS.md.
──────────────────────────────────────────────────────────────── */

import {
  ABSOLUTE_MARKERS,
  CAUSAL_MARKERS,
  CERTAINTY_MARKERS,
  DATA_SOURCE_MARKERS,
  HEDGE_MARKERS,
  INSTRUMENT_ALIASES,
  KIND_KEYWORDS,
  MONTHS,
  findMarkers,
  findNumericEvidence,
} from "./lexicon";
import {
  Assumption,
  ClaimKind,
  ContextCheck,
  LanguageRead,
  MarketContext,
  ParsedThesis,
  StrengthComponent,
  ThesisAnalysis,
  ThesisVerdict,
} from "./types";

export const THESIS_ENGINE_VERSION = 1;

/** Stated ≥ this while evidence ≤ FAKE_EVIDENCE_MAX ⇒ fake confidence. */
export const FAKE_STATED_MIN = 70;
export const FAKE_EVIDENCE_MAX = 35;

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const round = (x: number): number => Math.round(x);
const pct = (x: number, dp = 1): string => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(dp)}%`;

/* ── parsing ──────────────────────────────────────────────────── */

/** Naive-but-honest sentence splitter: ., !, ?, newlines. Keeps
 *  fragments ≥ 12 chars; decimal points and "$95." survive via the
 *  digit guard. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z$0-9])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

const LONG_WORDS = ["long", "buy", "upside", "rally", "higher", "breaks out", "break out", "going up", "squeeze higher", "moon", "re-rate higher", "outperform"];
const SHORT_WORDS = ["short", "sell off", "downside", "crash", "collapse", "lower", "going down", "roll over", "underperform", "fade"];

function inferDirection(text: string): "long" | "short" | null {
  const lower = text.toLowerCase();
  const longHits = LONG_WORDS.filter((w) => lower.includes(w)).length;
  const shortHits = SHORT_WORDS.filter((w) => lower.includes(w)).length;
  if (longHits === 0 && shortHits === 0) return null;
  return longHits >= shortHits ? "long" : "short";
}

function inferInstrument(text: string): { symbol: string; label: string; oilAdjacent: boolean } | null {
  const lower = ` ${text.toLowerCase()} `;
  let best: { symbol: string; label: string; oilAdjacent: boolean; hits: number } | null = null;
  for (const inst of INSTRUMENT_ALIASES) {
    let hits = 0;
    for (const a of inst.aliases) {
      let idx = -1;
      while ((idx = lower.indexOf(a, idx + 1)) !== -1) hits++;
    }
    if (hits > 0 && (best === null || hits > best.hits)) {
      best = { symbol: inst.symbol, label: inst.label, oilAdjacent: inst.oilAdjacent, hits };
    }
  }
  return best ? { symbol: best.symbol, label: best.label, oilAdjacent: best.oilAdjacent } : null;
}

/** Days from `asOf` (YYYY-MM-DD) to the END of the named month, next
 *  occurrence. "by September" on Jul 12 → ~80 days. */
function daysToMonthEnd(asOf: string, monthIdx: number): number {
  const now = new Date(`${asOf}T00:00:00Z`);
  let year = now.getUTCFullYear();
  if (monthIdx < now.getUTCMonth() || (monthIdx === now.getUTCMonth() && now.getUTCDate() > 25)) year += 1;
  const end = Date.UTC(year, monthIdx + 1, 0); // day 0 of next month = last day
  return Math.max(7, Math.round((end - now.getTime()) / 86_400_000));
}

function inferHorizonDays(text: string, asOf: string): { days: number; source: "stated" | "default"; phrase: string | null } {
  const lower = text.toLowerCase();
  for (const [name, idx] of Object.entries(MONTHS)) {
    if (lower.includes(`by ${name}`) || lower.includes(`before ${name}`) || lower.includes(`into ${name}`)) {
      return { days: daysToMonthEnd(asOf, idx), source: "stated", phrase: `by ${name}` };
    }
  }
  const rel = lower.match(/(?:within|in the next|over the next)\s+(\d+)\s*(day|week|month|quarter|year)s?/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const days = unit === "day" ? n : unit === "week" ? n * 7 : unit === "month" ? n * 30 : unit === "quarter" ? n * 91 : n * 365;
    return { days: clamp(days, 7, 730), source: "stated", phrase: rel[0] };
  }
  if (lower.includes("this week")) return { days: 7, source: "stated", phrase: "this week" };
  if (lower.includes("this month")) return { days: 30, source: "stated", phrase: "this month" };
  if (lower.includes("this quarter")) return { days: 91, source: "stated", phrase: "this quarter" };
  if (lower.includes("year end") || lower.includes("year-end") || lower.includes("eoy")) {
    const now = new Date(`${asOf}T00:00:00Z`);
    const end = Date.UTC(now.getUTCFullYear(), 11, 31);
    return { days: Math.max(14, Math.round((end - now.getTime()) / 86_400_000)), source: "stated", phrase: "year end" };
  }
  return { days: 90, source: "default", phrase: null };
}

function inferTargetPrice(text: string): number | null {
  // Prefer "$95" style near target-ish words; fall back to first $number.
  const m =
    text.match(/(?:target|to|at|hits?|touches|reach(?:es)?|toward[s]?)\s*\$\s?(\d+(?:[.,]\d+)?)/i) ??
    text.match(/\$\s?(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const v = Number(m[1].replace(",", ""));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function parseThesis(
  title: string,
  body: string,
  asOf: string,
  overrides: { direction?: "long" | "short" | "neutral"; instrument?: string; horizonDays?: number } = {},
): ParsedThesis {
  const full = `${title}. ${body}`;
  const sentences = splitSentences(body);

  const inferredDir = inferDirection(full);
  const direction = overrides.direction ?? inferredDir ?? "neutral";
  const directionSource = overrides.direction ? "stated" : inferredDir ? "inferred" : "default";

  const inferredInst = inferInstrument(full);
  let instrument: string;
  let instrumentLabel: string;
  let instrumentSource: ParsedThesis["instrumentSource"];
  if (overrides.instrument) {
    instrument = overrides.instrument;
    instrumentLabel = INSTRUMENT_ALIASES.find((i) => i.symbol === overrides.instrument)?.label ?? overrides.instrument;
    instrumentSource = "stated";
  } else if (inferredInst) {
    instrument = inferredInst.symbol;
    instrumentLabel = inferredInst.label;
    instrumentSource = "inferred";
  } else {
    instrument = "WTI";
    instrumentLabel = "WTI Crude";
    instrumentSource = "default";
  }

  const horizon = overrides.horizonDays
    ? { days: overrides.horizonDays, source: "stated" as const, phrase: null }
    : inferHorizonDays(full, asOf);

  return {
    direction,
    directionSource,
    instrument,
    instrumentLabel,
    instrumentSource,
    horizonDays: horizon.days,
    horizonSource: horizon.source,
    targetPrice: inferTargetPrice(full),
    sentences,
  };
}

/* ── claim classification & language read ─────────────────────── */

const KIND_PRIORITY: ClaimKind[] = ["timing", "positioning", "supply", "demand", "macro", "level", "direction", "causal"];

export function classifyKinds(sentence: string): ClaimKind[] {
  const lower = sentence.toLowerCase();
  const kinds: ClaimKind[] = [];
  for (const kind of KIND_PRIORITY) {
    const words = KIND_KEYWORDS[kind] ?? [];
    if (words.some((w) => lower.includes(w))) kinds.push(kind);
  }
  if (findMarkers(sentence, CAUSAL_MARKERS).length > 0 && !kinds.includes("causal")) kinds.push("causal");
  if (kinds.length === 0) kinds.push("direction"); // a thesis sentence with no family still asserts something
  return kinds;
}

export function readLanguage(sentence: string): LanguageRead {
  const certainty = findMarkers(sentence, CERTAINTY_MARKERS);
  const hedges = findMarkers(sentence, HEDGE_MARKERS);
  const absolutes = findMarkers(sentence, ABSOLUTE_MARKERS);
  const sources = findMarkers(sentence, DATA_SOURCE_MARKERS);
  const numbers = findNumericEvidence(sentence);

  const statedConfidence = round(clamp(50 + 12 * certainty.length - 10 * hedges.length, 5, 95));
  let evidenceScore = 15 + 18 * Math.min(numbers.length, 3) + 15 * Math.min(sources.length, 2);
  if (numbers.length === 0 && sources.length === 0) evidenceScore = Math.min(evidenceScore, 25);
  evidenceScore = round(clamp(evidenceScore, 5, 95));

  return {
    statedConfidence,
    evidenceScore,
    certaintyMarkers: certainty,
    hedgeMarkers: hedges,
    evidenceMarkers: [...numbers, ...sources],
    absoluteMarkers: absolutes,
  };
}

/* ── live-context cross-checks per claim kind ─────────────────── */

function noData(source: string, claimExpects: string): ContextCheck {
  return { source, claimExpects, marketReads: "no live data on this axis", verdict: "no_data", effect: 0 };
}

function directionWord(d: "long" | "short" | "neutral"): string {
  return d === "long" ? "upside" : d === "short" ? "downside" : "a move";
}

/** Cross-checks for one claim kind. Effects are the documented deltas
 *  applied to assessed confidence (+ supports / − contradicts). */
export function contextChecks(
  kind: ClaimKind,
  direction: "long" | "short" | "neutral",
  ctx: MarketContext,
): ContextCheck[] {
  const checks: ContextCheck[] = [];

  if (kind === "supply") {
    if (ctx.oilAdjacent && ctx.tape) {
      const tight = ctx.tape.stance === "SUPPLY_TIGHT";
      const ample = ctx.tape.stance === "SUPPLY_AMPLE";
      const wantsTight = direction !== "short";
      const verdict = tight === wantsTight && (tight || ample) ? "supports" : ample === wantsTight && (tight || ample) ? "contradicts" : "neutral";
      checks.push({
        source: "tape",
        claimExpects: wantsTight ? "a physically tight / supply-supportive market" : "an amply supplied market",
        marketReads: `composite tape ${ctx.tape.label} (${ctx.tape.runDate})`,
        verdict,
        effect: verdict === "supports" ? 12 : verdict === "contradicts" ? -15 : 0,
      });
    } else {
      checks.push(noData("tape", "physical supply conditions confirming the claim"));
    }
  }

  if (kind === "demand" || kind === "macro") {
    if (ctx.macro) {
      const gm = ctx.macro.growthMomentum;
      const wantsGrowth = direction !== "short";
      const accel = gm !== null && gm >= 0;
      const verdict: ContextCheck["verdict"] = gm === null ? "no_data" : accel === wantsGrowth ? "supports" : "contradicts";
      checks.push({
        source: "macro",
        claimExpects: wantsGrowth ? "growth momentum accelerating (demand tailwind)" : "growth momentum rolling over",
        marketReads: `GRID ${ctx.macro.quadrant}, growth momentum ${gm === null ? "—" : pct(gm, 2)} (${ctx.macro.runDate})`,
        verdict,
        effect: verdict === "supports" ? 10 : verdict === "contradicts" ? -12 : 0,
      });
      if (kind === "macro" && ctx.macro.pressureScore !== null && ctx.oilAdjacent) {
        const hot = ctx.macro.pressureScore >= 60;
        const verdict2: ContextCheck["verdict"] = direction === "long" ? (hot ? "contradicts" : "supports") : hot ? "supports" : "neutral";
        checks.push({
          source: "macro",
          claimExpects: direction === "long" ? "a macro backdrop not fighting oil" : "macro headwinds pressing on oil",
          marketReads: `macro pressure ${ctx.macro.pressureScore}/100${ctx.macro.diverging ? " · DIVERGENCE flagged" : ""}`,
          verdict: verdict2,
          effect: verdict2 === "supports" ? 8 : verdict2 === "contradicts" ? -12 : 0,
        });
      }
    } else {
      checks.push(noData("macro", "the macro regime agreeing with the claim"));
    }
  }

  if (kind === "positioning") {
    if (ctx.oilAdjacent && ctx.positioning) {
      const p = ctx.positioning;
      const pctile = p.percentile1y === null ? null : Math.round(p.percentile1y * 100);
      const crowdedSame =
        (direction === "long" && p.stance === "CROWDED_LONG") ||
        (direction === "short" && p.stance === "CROWDED_SHORT");
      const room =
        (direction === "long" && p.stance === "CROWDED_SHORT") ||
        (direction === "short" && p.stance === "CROWDED_LONG");
      const verdict: ContextCheck["verdict"] = crowdedSame ? "contradicts" : room ? "supports" : "neutral";
      checks.push({
        source: "positioning",
        claimExpects: `room for new ${direction === "short" ? "shorts" : "longs"} / a squeeze in your favor`,
        marketReads: `managed money ${p.stance.replace("_", " ").toLowerCase()}, net ${Math.round(p.netLength).toLocaleString("en-US")}${pctile !== null ? ` · ${pctile}th pctile 1y` : ""} (${p.reportDate})`,
        verdict,
        effect: verdict === "supports" ? 12 : verdict === "contradicts" ? -14 : 0,
      });
    } else {
      checks.push(noData("positioning", "futures positioning with capacity in your direction"));
    }
  }

  if (kind === "direction" || kind === "level") {
    if (ctx.trend) {
      const t = ctx.trend;
      const bullish = t.verdict.toUpperCase().includes("BULL");
      const bearish = t.verdict.toUpperCase().includes("BEAR");
      const aligned = (direction === "long" && bullish) || (direction === "short" && bearish);
      const against = (direction === "long" && bearish) || (direction === "short" && bullish);
      const verdict: ContextCheck["verdict"] = aligned ? "supports" : against ? "contradicts" : "neutral";
      checks.push({
        source: "trend",
        claimExpects: `the prevailing trend not fighting ${directionWord(direction)}`,
        marketReads: `Money Line ${t.verdict} on ${t.symbol} (daily ${t.dailyTrend > 0 ? "▲" : "▼"} / weekly ${t.weeklyTrend > 0 ? "▲" : "▼"}, ${t.runDate})`,
        verdict,
        effect: verdict === "supports" ? 10 : verdict === "contradicts" ? -14 : 0,
      });
    } else {
      checks.push(noData("trend", "the prevailing trend agreeing with the direction"));
    }
  }

  if (kind === "timing") {
    if (ctx.realizedVol) {
      checks.push({
        source: "vol",
        claimExpects: "enough time for the move at current volatility",
        marketReads: `realized σ ${(ctx.realizedVol.dailySigma * 100).toFixed(2)}%/day over ${ctx.realizedVol.observations} sessions (as of ${ctx.realizedVol.asOf})`,
        verdict: "neutral",
        effect: 0,
      });
    } else {
      checks.push(noData("vol", "volatility context for the deadline"));
    }
  }

  return checks;
}

/* ── counter-cases & kill evidence ────────────────────────────── */

function counterCaseFor(kind: ClaimKind, direction: "long" | "short" | "neutral", ctx: MarketContext, checks: ContextCheck[]): string {
  const contradiction = checks.find((c) => c.verdict === "contradicts");
  const lead = contradiction ? `Live data already leans against this: ${contradiction.marketReads}. ` : "";
  const dw = directionWord(direction);

  switch (kind) {
    case "supply":
      return (
        lead +
        (ctx.tape
          ? `If the tape stays ${ctx.tape.label}, the physical story is priced or stale — supply claims need barrels, not statements. Quota discipline historically erodes exactly when prices reward cheating.`
          : `Supply narratives break quietly: one outage resolves, one quota slips, and the draw story becomes a build story. Without a live tape read on file, this leg is running on memory, not measurement.`)
      );
    case "demand":
      return (
        lead +
        `Demand recovery is the most-cited and least-verified leg in commodity theses — it arrives in monthly data with revisions. If consumption disappoints for one print cycle, the ${dw} case loses its engine while the deadline keeps running.`
      );
    case "macro":
      return (
        lead +
        (ctx.macro
          ? `The GRID sits in ${ctx.macro.quadrant}; regimes flip on second derivatives, not headlines. If growth or inflation momentum crosses zero, the macro leg reverses sign faster than a commodity rebalances.`
          : `Macro claims without a regime read are vibes about the Fed. The dollar and rates can reprice in days; physical markets take weeks — a macro surprise outruns this thesis.`)
      );
    case "positioning":
      return (
        lead +
        (ctx.positioning && ctx.oilAdjacent
          ? `Positioning is ${ctx.positioning.stance.replace("_", " ").toLowerCase()} — if the crowd is already ${direction === "long" ? "long with you, the marginal buyer is in" : direction === "short" ? "short with you, the borrow is crowded" : "leaning one way"}, the unwind happens TO you, not FOR you.`
          : `Positioning stories need positioning data. Without a COT read on file this leg asserts what other traders hold without a measurement — the squeeze may already have happened.`)
      );
    case "timing":
      return (
        lead +
        `A deadline converts "early" into "wrong". ${
          ctx.realizedVol
            ? `At ${(ctx.realizedVol.dailySigma * 100).toFixed(2)}%/day realized σ, pure noise spans ±${(ctx.realizedVol.dailySigma * Math.sqrt(63) * 100).toFixed(1)}% over a quarter — the thesis can be right and still miss the date.`
            : `Without a vol read, there's no basis for believing the move fits the window.`
        }`
      );
    case "level":
      return (
        lead +
        `Levels are memory, not physics. The market has no obligation to respect support/resistance without current flow behind it — and every stopped-out holder at that level is future supply against you.`
      );
    case "causal":
      return (
        lead +
        `Every "therefore" multiplies error: three links at 70% each is a 34% chain. The strongest counter-case is boring — one middle link fails quietly and the conclusion dies with no headline to warn you.`
      );
    case "direction":
    default:
      return (
        lead +
        (ctx.trend
          ? `Money Line reads ${ctx.trend.verdict} — fighting the prevailing state means paying to be early. `
          : ``) +
        `The strongest case against ${dw}: nothing you listed is unknown to the market. If the story is public and price hasn't moved, the market is telling you what it thinks it's worth.`
      );
  }
}

function killEvidenceFor(kind: ClaimKind, direction: "long" | "short" | "neutral", parsedTarget: number | null, ctx: MarketContext): string[] {
  const sym = ctx.trend?.symbol ?? ctx.price?.symbol ?? "the instrument";
  switch (kind) {
    case "supply":
      return [
        "Two consecutive weekly EIA crude builds > +4 Mbbl (draw story invalidated)",
        "Composite tape flips to SUPPLY-AMPLE and holds a week",
        "OPEC+ actual exports rise while quotas claim cuts (compliance break)",
      ];
    case "demand":
      return [
        "Growth momentum (Δ YoY industrial production) turns negative",
        "GRID quadrant flips to DEFLATION (both axes decelerating)",
        "Two months of demand prints revised down",
      ];
    case "macro":
      return [
        direction === "long" ? "Macro pressure ≥ 66 while price stalls (headwind confirmed)" : "Macro pressure ≤ 33 with growth re-accelerating",
        "Broad USD 6-month change > +5% (dollar headwind at full scale)",
        "Quadrant flip against the thesis (watch momentum signs, not levels)",
      ];
    case "positioning":
      return [
        "Managed-money net-length percentile ≥ 90th in your direction (no marginal buyer left)",
        "Two COT reports pass without the expected build/unwind",
        "Price fails to move on positioning-friendly news (flow already spent)",
      ];
    case "timing":
      return [
        "Half the horizon elapsed with less than half the required move",
        "Realized vol collapses (the move now needs a bigger σ multiple than when priced)",
      ];
    case "level":
      return [
        `Two consecutive daily closes beyond the level on ${sym}`,
        "The level is retested and holds — for the other side",
      ];
    case "causal":
      return [
        "Any single link prints opposite (check each link's data, not the conclusion)",
        "The conclusion arrives WITHOUT your mechanism (right for the wrong reason = unhedged luck)",
      ];
    case "direction":
    default: {
      const out = [
        `Daily Money Line flip ${direction === "short" ? "bullish" : "bearish"} on ${sym}`,
        `Weekly Money Line confirms against the thesis (double confirmation opposite)`,
      ];
      if (parsedTarget !== null && ctx.price) {
        const stopish = direction === "short" ? ctx.price.value * 1.05 : ctx.price.value * 0.95;
        out.push(`Close beyond ~$${stopish.toFixed(2)} (5% against entry zone) without new information`);
      }
      return out;
    }
  }
}

/* ── fragility & confidence scoring ───────────────────────────── */

const BASE_FRAGILITY: Record<ClaimKind, number> = {
  timing: 70,
  causal: 65,
  positioning: 60,
  direction: 55,
  level: 55,
  demand: 50,
  macro: 50,
  supply: 45,
};

interface ScoredClaim {
  confidence: number;
  fragility: number;
  fake: boolean;
  reasons: string[];
}

export function scoreClaim(
  kind: ClaimKind,
  lang: LanguageRead,
  checks: ContextCheck[],
  extras: { hasDeadlineAndTarget: boolean; crowdedSameDirection: boolean },
): ScoredClaim {
  const reasons: string[] = [];

  // assessed confidence — evidence-led, tone-discounted
  let confidence = 0.45 * lang.evidenceScore + 0.2 * lang.statedConfidence;
  reasons.push(`confidence base: 0.45×evidence(${lang.evidenceScore}) + 0.20×stated(${lang.statedConfidence}) = ${round(confidence)}`);
  for (const c of checks) {
    if (c.effect !== 0) {
      confidence += c.effect;
      reasons.push(`${c.effect > 0 ? "+" : ""}${c.effect} — ${c.source} ${c.verdict}: ${c.marketReads}`);
    } else if (c.verdict === "no_data") {
      reasons.push(`±0 — ${c.source}: no live data to check "${c.claimExpects}"`);
    }
  }
  if (kind === "causal" && lang.evidenceMarkers.length === 0) {
    confidence -= 8;
    reasons.push("−8 — causal chain with zero numbers: a story, not a measurement");
  }

  const fake = lang.statedConfidence >= FAKE_STATED_MIN && lang.evidenceScore <= FAKE_EVIDENCE_MAX;
  if (fake) {
    confidence -= 6;
    reasons.push(`−6 — fake confidence: stated ${lang.statedConfidence} ≥ ${FAKE_STATED_MIN} but evidence ${lang.evidenceScore} ≤ ${FAKE_EVIDENCE_MAX}`);
  }

  // fragility
  let fragility = BASE_FRAGILITY[kind];
  const fragReasons: string[] = [`fragility base for ${kind}: ${fragility}`];
  const absEffect = Math.min(lang.absoluteMarkers.length * 12, 24);
  if (absEffect > 0) {
    fragility += absEffect;
    fragReasons.push(`+${absEffect} — absolutes: ${lang.absoluteMarkers.join(", ")}`);
  }
  const contradictions = checks.filter((c) => c.verdict === "contradicts");
  const contraEffect = Math.min(contradictions.length * 14, 28);
  if (contraEffect > 0) {
    fragility += contraEffect;
    fragReasons.push(`+${contraEffect} — ${contradictions.length} live contradiction${contradictions.length > 1 ? "s" : ""}`);
  }
  const supports = checks.filter((c) => c.verdict === "supports");
  const supEffect = Math.min(supports.length * 8, 16);
  if (supEffect > 0) {
    fragility -= supEffect;
    fragReasons.push(`−${supEffect} — ${supports.length} live corroboration${supports.length > 1 ? "s" : ""}`);
  }
  if (extras.hasDeadlineAndTarget && (kind === "timing" || kind === "direction")) {
    fragility += 10;
    fragReasons.push("+10 — deadline AND price target compound (must be right twice)");
  }
  if (extras.crowdedSameDirection && (kind === "positioning" || kind === "direction")) {
    fragility += 12;
    fragReasons.push("+12 — positioning crowded in the thesis direction (unwind risk)");
  }
  if (fake) {
    fragility += 10;
    fragReasons.push("+10 — fake confidence marker");
  }
  if (lang.evidenceScore >= 60) {
    fragility -= 8;
    fragReasons.push("−8 — well-evidenced claim (numbers/named sources)");
  }

  return {
    confidence: round(clamp(confidence, 3, 97)),
    fragility: round(clamp(fragility, 5, 95)),
    fake,
    reasons: [...reasons, ...fragReasons],
  };
}

/* ── implied assumptions ──────────────────────────────────────── */

function impliedAssumptions(parsed: ParsedThesis, ctx: MarketContext, explicitKinds: Set<ClaimKind>, nextId: () => string): Assumption[] {
  const out: Assumption[] = [];
  const dir = parsed.direction;

  // 1 — vol plausibility: target + horizon vs realized σ. Always added
  // when computable; it is the thesis's physics check.
  if (parsed.targetPrice !== null && ctx.price && ctx.realizedVol && ctx.price.value > 0) {
    const requiredPct = ((parsed.targetPrice - ctx.price.value) / ctx.price.value) * 100;
    const tradingDays = Math.max(5, Math.round(parsed.horizonDays * (252 / 365)));
    const sigmaH = ctx.realizedVol.dailySigma * Math.sqrt(tradingDays) * 100;
    const multiple = sigmaH > 0 ? Math.abs(requiredPct) / sigmaH : Infinity;
    const frag = multiple <= 1 ? 35 : multiple <= 2 ? 55 : 78;
    const conf = multiple <= 1 ? 62 : multiple <= 2 ? 45 : 25;
    out.push({
      id: nextId(),
      origin: "implied",
      kind: "timing",
      text: `Target $${parsed.targetPrice} in ~${parsed.horizonDays}d requires ${pct(requiredPct)} — ${multiple === Infinity ? "unmeasurable" : `${multiple.toFixed(1)}× the realized σ for that horizon (±${sigmaH.toFixed(1)}%)`}. The thesis implicitly assumes the market moves ${multiple > 1.5 ? "well beyond" : "within"} its recent distribution.`,
      sourceSentence: null,
      language: null,
      confidence: conf,
      fragility: frag,
      fakeConfidence: false,
      reasons: [
        `required move ${pct(requiredPct)} from $${ctx.price.value.toFixed(2)} (${ctx.price.source}, ${ctx.price.asOf})`,
        `horizon σ = ${(ctx.realizedVol.dailySigma * 100).toFixed(2)}%/day × √${tradingDays} sessions = ±${sigmaH.toFixed(1)}%`,
        `σ-multiple ${multiple === Infinity ? "∞" : multiple.toFixed(2)} → fragility ${frag} (≤1σ→35, ≤2σ→55, >2σ→78)`,
      ],
      checks: [],
      counterCase: `The move you need is a ${multiple === Infinity ? "large" : `${multiple.toFixed(1)}σ`} event at current vol. Markets deliver those — but pricing one as the BASE case means the distribution has to bend your way on schedule.`,
      killEvidence: [
        "Half the horizon gone with less than half the move",
        "Realized vol falls further (the target drifts more σs away)",
      ],
    });
  }

  // 2 — trend alignment (skip if the author already made a direction claim
  // AND we have no trend read to add).
  if (dir !== "neutral" && ctx.trend) {
    const bullish = ctx.trend.verdict.toUpperCase().includes("BULL");
    const bearish = ctx.trend.verdict.toUpperCase().includes("BEAR");
    const against = (dir === "long" && bearish) || (dir === "short" && bullish);
    const aligned = (dir === "long" && bullish) || (dir === "short" && bearish);
    out.push({
      id: nextId(),
      origin: "implied",
      kind: "direction",
      text: `A ${dir} thesis implicitly assumes the prevailing trend state won't fight it. Money Line currently reads ${ctx.trend.verdict} on ${ctx.trend.symbol}.`,
      sourceSentence: null,
      language: null,
      confidence: aligned ? 68 : against ? 28 : 48,
      fragility: against ? 75 : aligned ? 35 : 50,
      fakeConfidence: false,
      reasons: [
        `Money Line ${ctx.trend.verdict} (daily ${ctx.trend.dailyTrend > 0 ? "+1" : "−1"} / weekly ${ctx.trend.weeklyTrend > 0 ? "+1" : "−1"}, ${ctx.trend.runDate}, ${ctx.trend.source})`,
        against ? "thesis fights the confirmed state → confidence 28 / fragility 75" : aligned ? "thesis rides the confirmed state → confidence 68 / fragility 35" : "state is mixed → neutral 48/50",
      ],
      checks: [],
      counterCase: against
        ? `You are fading a double-confirmed ${ctx.trend.verdict.toLowerCase()} state. Historically the expensive part isn't being wrong — it's being early while the trend finishes.`
        : `Trend agreement is rented, not owned: a daily flip is the first domino, and it can land the day after entry.`,
      killEvidence: [`Daily Money Line flip against the thesis on ${ctx.trend.symbol}`, "Weekly confirmation of that flip (state change, not noise)"],
    });
  }

  // 3 — macro backdrop (only when not already claimed explicitly).
  if (!explicitKinds.has("macro") && dir !== "neutral" && ctx.macro) {
    const adverse = dir === "long" ? "DEFLATION" : "REFLATION";
    const inAdverse = ctx.macro.quadrant === adverse;
    out.push({
      id: nextId(),
      origin: "implied",
      kind: "macro",
      text: `The thesis never mentions the macro regime — it implicitly assumes the ${ctx.macro.quadrant} backdrop stays benign for ${directionWord(dir)}.`,
      sourceSentence: null,
      language: null,
      confidence: inAdverse ? 30 : 55,
      fragility: inAdverse ? 72 : 48,
      fakeConfidence: false,
      reasons: [
        `GRID ${ctx.macro.quadrant} (${ctx.macro.runDate})${ctx.macro.pressureScore !== null ? ` · macro pressure ${ctx.macro.pressureScore}/100` : ""}`,
        inAdverse ? `adverse quadrant for a ${dir} → confidence 30 / fragility 72` : `quadrant not adverse → 55/48`,
      ],
      checks: [],
      counterCase: `An unexamined macro leg is still a leg. If the quadrant flips ${dir === "long" ? "into DEFLATION (growth and inflation decelerating)" : "into REFLATION (both accelerating)"}, the backdrop repricing arrives regardless of how right the micro story is.`,
      killEvidence: [`Quadrant flip to ${adverse}`, "Macro pressure crossing 66 (elevated) against the thesis"],
    });
  }

  // 4 — positioning capacity (oil-adjacent, not already claimed).
  if (!explicitKinds.has("positioning") && dir !== "neutral" && ctx.oilAdjacent && ctx.positioning) {
    const p = ctx.positioning;
    const crowdedSame = (dir === "long" && p.stance === "CROWDED_LONG") || (dir === "short" && p.stance === "CROWDED_SHORT");
    const pctile = p.percentile1y === null ? null : Math.round(p.percentile1y * 100);
    out.push({
      id: nextId(),
      origin: "implied",
      kind: "positioning",
      text: `Unstated positioning leg: the trade needs a marginal ${dir === "long" ? "buyer" : "seller"} who isn't already in. COT reads ${p.stance.replace("_", " ").toLowerCase()}${pctile !== null ? ` (${pctile}th pctile 1y)` : ""}.`,
      sourceSentence: null,
      language: null,
      confidence: crowdedSame ? 30 : 55,
      fragility: crowdedSame ? 74 : 46,
      fakeConfidence: false,
      reasons: [
        `managed money net ${Math.round(p.netLength).toLocaleString("en-US")}${pctile !== null ? `, ${pctile}th percentile (1y)` : ""} as of ${p.reportDate}`,
        crowdedSame ? "crowd already leans your way → 30/74" : "capacity exists → 55/46",
      ],
      checks: [],
      counterCase: crowdedSame
        ? `The crowd got there first: when consensus is ${p.stance.replace("_", " ").toLowerCase()} and new information disappoints, the exit is one door wide.`
        : `Positioning capacity today is not positioning capacity at your exit — the crowd arrives during the move, and the last COT print before your target is the one that matters.`,
      killEvidence: ["Net-length percentile ≥ 90th in the thesis direction", "A >20% one-week net-length swing against the thesis"],
    });
  }

  return out;
}

/* ── overall strength ─────────────────────────────────────────── */

function verdictOf(strength: number): ThesisVerdict {
  return strength >= 70 ? "ROBUST" : strength >= 55 ? "TESTED" : strength >= 40 ? "STRAINED" : "FRAGILE";
}

/* The five support pillars a thesis can stand on. */
const PILLARS: ClaimKind[] = ["supply", "demand", "macro", "positioning", "level"];

export function analyzeThesis(
  title: string,
  body: string,
  ctx: MarketContext,
  overrides: { direction?: "long" | "short" | "neutral"; instrument?: string; horizonDays?: number } = {},
): ThesisAnalysis {
  const parsed = parseThesis(title, body, ctx.asOf, overrides);
  let idCounter = 0;
  const nextId = () => `a${++idCounter}`;

  const hasDeadline = parsed.horizonSource === "stated";
  const hasTarget = parsed.targetPrice !== null;
  const crowdedSame =
    ctx.oilAdjacent &&
    ctx.positioning !== null &&
    ((parsed.direction === "long" && ctx.positioning.stance === "CROWDED_LONG") ||
      (parsed.direction === "short" && ctx.positioning.stance === "CROWDED_SHORT"));

  // explicit claims — one assumption per sentence, primary kind first
  const assumptions: Assumption[] = [];
  const explicitKinds = new Set<ClaimKind>();
  for (const sentence of parsed.sentences) {
    const kinds = classifyKinds(sentence);
    const kind = kinds[0];
    explicitKinds.add(kind);
    const lang = readLanguage(sentence);
    const checks = contextChecks(kind, parsed.direction, ctx);
    const scored = scoreClaim(kind, lang, checks, {
      hasDeadlineAndTarget: hasDeadline && hasTarget,
      crowdedSameDirection: crowdedSame,
    });
    assumptions.push({
      id: nextId(),
      origin: "explicit",
      kind,
      text: sentence,
      sourceSentence: sentence,
      language: lang,
      confidence: scored.confidence,
      fragility: scored.fragility,
      fakeConfidence: scored.fake,
      reasons: scored.reasons,
      checks,
      counterCase: counterCaseFor(kind, parsed.direction, ctx, checks),
      killEvidence: killEvidenceFor(kind, parsed.direction, parsed.targetPrice, ctx),
    });
  }

  assumptions.push(...impliedAssumptions(parsed, ctx, explicitKinds, nextId));

  // weakest-first: fragility desc, then confidence asc
  assumptions.sort((a, b) => b.fragility - a.fragility || a.confidence - b.confidence);

  /* ── strength: base 50 + listed components, nothing else ── */
  const components: StrengthComponent[] = [];
  let strength = 50;
  components.push({ key: "base", label: "Base", effect: 0, detail: "every thesis starts at 50 — strength is earned, weakness is charged" });

  const explicit = assumptions.filter((a) => a.origin === "explicit");
  if (explicit.length > 0) {
    const weighted = explicit.map((a) => ({ a, w: a.kind === "direction" ? 1.5 : 1 }));
    const wSum = weighted.reduce((s, x) => s + x.w, 0);
    const avgConf = weighted.reduce((s, x) => s + x.a.confidence * x.w, 0) / wSum;
    const eff = round(clamp((avgConf - 50) * 0.5, -15, 15));
    strength += eff;
    components.push({
      key: "claim_quality",
      label: "Claim quality",
      effect: eff,
      detail: `weighted avg assessed confidence ${round(avgConf)}/100 across ${explicit.length} explicit claims (direction ×1.5) → (avg−50)×0.5`,
    });
  } else {
    strength -= 12;
    components.push({ key: "claim_quality", label: "Claim quality", effect: -12, detail: "no scoreable claims found in the body" });
  }

  const pillarsPresent = PILLARS.filter((p) => explicitKinds.has(p));
  const pillarEff = pillarsPresent.length >= 3 ? 8 : pillarsPresent.length === 2 ? 3 : -6;
  strength += pillarEff;
  components.push({
    key: "pillars",
    label: "Support pillars",
    effect: pillarEff,
    detail: `${pillarsPresent.length} independent pillar${pillarsPresent.length === 1 ? "" : "s"} (${pillarsPresent.join(", ") || "none"}) — ≥3→+8, 2→+3, ≤1→−6`,
  });

  const contradictions = assumptions.reduce((n, a) => n + a.checks.filter((c) => c.verdict === "contradicts").length, 0);
  const contraEff = -Math.min(contradictions * 7, 21);
  if (contraEff !== 0) strength += contraEff;
  components.push({
    key: "contradictions",
    label: "Live contradictions",
    effect: contraEff,
    detail: `${contradictions} live-data contradiction${contradictions === 1 ? "" : "s"} × −7 (cap −21)`,
  });

  const corroborations = assumptions.reduce((n, a) => n + a.checks.filter((c) => c.verdict === "supports").length, 0);
  const corrEff = Math.min(corroborations * 4, 12);
  if (corrEff !== 0) strength += corrEff;
  components.push({
    key: "corroborations",
    label: "Live corroborations",
    effect: corrEff,
    detail: `${corroborations} live-data confirmation${corroborations === 1 ? "" : "s"} × +4 (cap +12)`,
  });

  const fakes = assumptions.filter((a) => a.fakeConfidence).length;
  const fakeEff = -Math.min(fakes * 6, 18);
  if (fakeEff !== 0) strength += fakeEff;
  components.push({
    key: "fake_confidence",
    label: "Fake confidence",
    effect: fakeEff,
    detail: `${fakes} claim${fakes === 1 ? "" : "s"} stated ≥${FAKE_STATED_MIN} with evidence ≤${FAKE_EVIDENCE_MAX} × −6 (cap −18)`,
  });

  const maxFrag = assumptions.length ? Math.max(...assumptions.map((a) => a.fragility)) : 0;
  const weakEff = maxFrag >= 75 ? -8 : 0;
  if (weakEff !== 0) strength += weakEff;
  components.push({
    key: "weakest_link",
    label: "Weakest link",
    effect: weakEff,
    detail: maxFrag >= 75 ? `top fragility ${maxFrag} ≥ 75 — one leg can take the whole thesis down` : `top fragility ${maxFrag} < 75 — no single point of collapse`,
  });

  const withNumbers = explicit.filter((a) => (a.language?.evidenceMarkers.length ?? 0) > 0).length;
  const density = explicit.length > 0 ? withNumbers / explicit.length : 0;
  const densityEff = density >= 0.5 ? 6 : density === 0 ? -8 : 0;
  if (densityEff !== 0) strength += densityEff;
  components.push({
    key: "evidence_density",
    label: "Evidence density",
    effect: densityEff,
    detail: `${withNumbers}/${explicit.length} explicit claims carry numbers or named sources — ≥50%→+6, 0%→−8`,
  });

  if (hasDeadline && hasTarget) {
    strength -= 4;
    components.push({ key: "compound_bet", label: "Deadline × target", effect: -4, detail: "must be right on direction AND schedule — a compound bet" });
  }

  strength = round(clamp(strength, 2, 98));
  const verdict = verdictOf(strength);

  const weakest = assumptions[0];
  const noDataCount = assumptions.reduce((n, a) => n + a.checks.filter((c) => c.verdict === "no_data").length, 0);
  const headline =
    `${verdict} at ${strength}/100. ` +
    (weakest
      ? `Weakest leg: ${weakest.origin === "implied" ? "an unstated assumption — " : ""}${weakest.kind} (fragility ${weakest.fragility}). `
      : "") +
    (contradictions > 0 ? `${contradictions} live contradiction${contradictions === 1 ? "" : "s"} on the tape. ` : "") +
    (fakes > 0 ? `${fakes} claim${fakes === 1 ? "" : "s"} louder than the evidence behind ${fakes === 1 ? "it" : "them"}. ` : "") +
    (noDataCount > 0 ? `${noDataCount} check${noDataCount === 1 ? "" : "s"} had no live data — unverified, not verified.` : "");

  const contextCoverage = [
    { source: "price", live: ctx.price !== null, detail: ctx.price ? `${ctx.price.symbol} $${ctx.price.value.toFixed(2)} (${ctx.price.source}, ${ctx.price.asOf})` : "no live price for the instrument" },
    { source: "vol", live: ctx.realizedVol !== null, detail: ctx.realizedVol ? `σ ${(ctx.realizedVol.dailySigma * 100).toFixed(2)}%/day · ${ctx.realizedVol.observations} sessions` : "no return series on file" },
    { source: "tape", live: ctx.tape !== null && ctx.oilAdjacent, detail: ctx.tape && ctx.oilAdjacent ? `${ctx.tape.label} (${ctx.tape.runDate})` : ctx.oilAdjacent ? "tape not computed yet" : "not oil-adjacent — tape not applicable" },
    { source: "macro", live: ctx.macro !== null, detail: ctx.macro ? `${ctx.macro.quadrant} (${ctx.macro.runDate})` : "macro cycle pending" },
    { source: "positioning", live: ctx.positioning !== null && ctx.oilAdjacent, detail: ctx.positioning && ctx.oilAdjacent ? `${ctx.positioning.stance} (${ctx.positioning.reportDate})` : ctx.oilAdjacent ? "COT history building" : "not oil-adjacent — WTI COT not applicable" },
    { source: "trend", live: ctx.trend !== null, detail: ctx.trend ? `${ctx.trend.verdict} on ${ctx.trend.symbol} (${ctx.trend.runDate})` : "no Money Line scan for this symbol" },
  ];

  return {
    engineVersion: THESIS_ENGINE_VERSION,
    analyzedAt: new Date().toISOString(),
    parsed,
    assumptions,
    strength,
    verdict,
    strengthComponents: components,
    headline,
    contextCoverage,
  };
}
