/* ────────────────────────────────────────────────────────────────
   Thesis Lab — shared types for the pressure-test engine (P·07),
   the scenario engine and the portfolio risk audit. Pure domain: no
   IO here (mirrors macro/types.ts).

   Design rule carried through every shape: NO OPAQUE SCORES. Every
   scored thing carries `reasons` — the exact, human-readable list of
   contributions that produced its number — and every live-data
   comparison names the source it read (tape / macro / COT / trend /
   vol). A consumer can always answer "why does it say that?".
──────────────────────────────────────────────────────────────── */

/* ── claims & assumptions ─────────────────────────────────────── */

/** What kind of statement a claim is — drives base fragility, the
 *  counter-case template and the kill-evidence template. */
export type ClaimKind =
  | "direction"    // price goes up/down, target levels
  | "supply"       // OPEC, production, inventories, spare capacity
  | "demand"       // consumption, China, growth, seasonality of use
  | "macro"        // Fed, dollar, rates, inflation, recession
  | "positioning"  // funds, COT, shorts/longs, squeeze mechanics
  | "timing"       // deadlines: "by September", "this quarter"
  | "level"        // support/resistance, cheap/expensive, oversold
  | "causal";      // X therefore Y chains with no data anchor

export type AssumptionOrigin = "explicit" | "implied";

/** How the linguistic scorer read one claim's language. */
export interface LanguageRead {
  /** 0..100 — how strongly the author ASSERTS it (modal verbs,
   *  absolutes, intensifiers vs hedges). Not truth — tone. */
  statedConfidence: number;
  /** 0..100 — how much checkable substance the sentence carries
   *  (numbers, dates, named data sources, magnitudes). */
  evidenceScore: number;
  /** Markers found, verbatim, so the UI can underline them. */
  certaintyMarkers: string[];
  hedgeMarkers: string[];
  evidenceMarkers: string[];
  absoluteMarkers: string[];
}

/** One live-data cross-check applied to a claim. */
export interface ContextCheck {
  source: string;        // "tape" | "macro" | "positioning" | "trend" | "vol" | "price"
  claimExpects: string;  // what the claim needs to be true, in words
  marketReads: string;   // what the live data currently says
  verdict: "supports" | "contradicts" | "neutral" | "no_data";
  /** Signed effect this check applied (documented in reasons too). */
  effect: number;
}

/** A single assumption after scoring — the engine's core output. */
export interface Assumption {
  id: string;                 // "a1", "a2", … stable within one analysis
  origin: AssumptionOrigin;
  kind: ClaimKind;
  /** The claim in the author's own words (explicit) or the engine's
   *  derivation (implied — always prefixed with what implied it). */
  text: string;
  /** For explicit claims: the exact source sentence. */
  sourceSentence: string | null;
  language: LanguageRead | null;  // null for implied assumptions
  /** 0..100 assessed confidence — evidence + live agreement, NOT tone. */
  confidence: number;
  /** 0..100 — how easily this leg snaps (timing tightness, absolutes,
   *  crowding, single-point dependence, live contradictions). */
  fragility: number;
  /** Stated ≥ high while evidence ≤ low — the tell of a claim dressed
   *  up as a fact. Thresholds documented in engine.ts. */
  fakeConfidence: boolean;
  /** Every scoring contribution, in order, human-readable. */
  reasons: string[];
  /** Live-data cross-checks that touched this assumption. */
  checks: ContextCheck[];
  /** The strongest case AGAINST this assumption, instantiated with
   *  live numbers where the context has them. */
  counterCase: string;
  /** Concrete observables that would weaken or invalidate it. */
  killEvidence: string[];
}

/* ── whole-thesis output ──────────────────────────────────────── */

export type ThesisVerdict = "ROBUST" | "TESTED" | "STRAINED" | "FRAGILE";

/** One line of the overall-strength math — shown verbatim in the UI. */
export interface StrengthComponent {
  key: string;
  label: string;
  /** Signed contribution to the 0..100 strength. */
  effect: number;
  detail: string;
}

export interface ParsedThesis {
  direction: "long" | "short" | "neutral";
  directionSource: "stated" | "inferred" | "default";
  instrument: string;          // "WTI" | "BRENT" | bull-universe symbol
  instrumentLabel: string;
  instrumentSource: "stated" | "inferred" | "default";
  horizonDays: number;
  horizonSource: "stated" | "inferred" | "default";
  targetPrice: number | null;  // parsed from the text when present
  sentences: string[];
}

export interface ThesisAnalysis {
  engineVersion: number;
  analyzedAt: string;          // ISO
  parsed: ParsedThesis;
  assumptions: Assumption[];   // sorted weakest-first (fragility desc)
  /** 0..100 with full component math. */
  strength: number;
  verdict: ThesisVerdict;
  strengthComponents: StrengthComponent[];
  /** One-paragraph plain-English summary of where the thesis is weak. */
  headline: string;
  /** Which live sources were actually available for cross-checks. */
  contextCoverage: { source: string; live: boolean; detail: string }[];
}

/* ── market context (assembled by marketContext.ts, consumed pure) ── */

export interface RealizedVol {
  /** Daily log-return stdev over the window (fraction, e.g. 0.021). */
  dailySigma: number;
  windowDays: number;          // calendar window requested
  observations: number;        // return points actually used
  asOf: string;
}

export interface TrendRead {
  symbol: string;
  verdict: string;             // Money Line verdict, e.g. "BULLISH"/"BEARISH"/…
  dailyTrend: number;          // +1 / −1
  weeklyTrend: number;
  runDate: string;
  source: "bull_snapshots" | "regime_snapshots";
}

/** Everything the pure engines may cross-check against. Every field
 *  nullable — a missing feed degrades the check to "no_data", never
 *  a fake number (house truth rule). */
export interface MarketContext {
  asOf: string;                                    // ISO date the context was assembled
  price: { symbol: string; value: number; asOf: string; source: string } | null;
  priceSeries: { date: string; close: number }[];  // ascending, for vol/percentiles
  realizedVol: RealizedVol | null;
  tape: { stance: string; label: string; headline: string; runDate: string } | null;
  macro: {
    quadrant: string;
    growthMomentum: number | null;
    inflationMomentum: number | null;
    pressureScore: number | null;
    diverging: boolean;
    runDate: string;
  } | null;
  positioning: {
    stance: string;
    netLength: number;
    percentile1y: number | null;
    reportDate: string;
  } | null;
  trend: TrendRead | null;
  /** True when the instrument is oil-adjacent — COT/tape checks only
   *  apply there; for other symbols those checks read no_data. */
  oilAdjacent: boolean;
}

/* ── scenarios ────────────────────────────────────────────────── */

export type ScenarioId = "bear_tail" | "bear" | "base" | "bull" | "bull_tail";

export interface AssumptionOutcome {
  assumptionId: string;
  state: "holds" | "stressed" | "breaks";
  why: string;
}

export interface Scenario {
  id: ScenarioId;
  name: string;
  /** Narrative driver, instantiated from live context when possible. */
  narrative: string;
  /** σ multiple this scenario sits at (0 for base). */
  sigma: number;
  price: number | null;        // null when no price anchor exists
  movePct: number | null;
  /** Empirical frequency of horizon-length windows landing in this
   *  bucket over the trailing series — labeled, never a forecast. */
  probability: number | null;
  probabilityBasis: string;
  /** P&L sign for the thesis direction in this scenario. */
  thesisPnlPct: number | null;
  assumptionOutcomes: AssumptionOutcome[];
  /** What this scenario does to the thesis in one line. */
  thesisImpact: string;
}

export interface ScenarioSet {
  generatedAt: string;
  instrument: string;
  anchorPrice: number | null;
  anchorSource: string;
  horizonDays: number;
  horizonTradingDays: number;
  /** σ over the horizon (fraction) and how it was derived. */
  horizonSigma: number | null;
  sigmaBasis: string;
  scenarios: Scenario[];       // ordered downside-first
  /** Sum check + basis note for the probability column. */
  probabilityNote: string;
}

/* ── portfolio risk ───────────────────────────────────────────── */

export interface PositionInput {
  id: number;
  symbol: string;
  displayName: string | null;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  manualMark: number | null;
  thesisId: number | null;
  notes: string | null;
  openedAt: string | null;
}

export interface MarkedPosition extends PositionInput {
  mark: number | null;
  markSource: "latest_quotes" | "bull_snapshots" | "manual" | "entry_fallback" | "none";
  markAsOf: string | null;
  exposure: number | null;       // |quantity × mark|, USD
  weight: number | null;         // exposure / gross
  pnlPct: number | null;         // signed, vs entry
  atrPct: number | null;         // from bull_snapshots when available
  trendVerdict: string | null;   // Money Line verdict when available
  /** Daily vol proxy used for risk: atr_pct/100 when present, else
   *  realized sigma from bars, else null (position reads unmodeled). */
  dailyVol: number | null;
  volSource: string;
}

export type RiskFlagKind =
  | "OVERSIZED_WEAK_THESIS"
  | "NO_THESIS"
  | "TREND_CONFLICT"
  | "CROWDED_TRADE"
  | "CORRELATION_STACK"
  | "STALE_MARK"
  | "UNMODELED";

export interface RiskFlag {
  kind: RiskFlagKind;
  severity: "high" | "medium" | "low";
  positionId: number | null;   // null = portfolio-level flag
  symbol: string | null;
  message: string;
  detail: string;
}

export interface CorrelationPair {
  a: string;
  b: string;
  rho: number;
  observations: number;
}

export interface PositionRisk {
  positionId: number;
  symbol: string;
  /** weight × dailyVol, normalized across the book — the risk share. */
  riskContribution: number | null;
  riskShare: number | null;      // 0..1 of total modeled risk
  /** Thesis strength when linked (from saved analysis). */
  thesisStrength: number | null;
  thesisVerdict: string | null;
  sizeRank: number;              // 1 = largest exposure
  riskRank: number | null;       // 1 = largest risk contribution
  scenarioPnl: Partial<Record<ScenarioId, number | null>>; // USD, signed
  reasons: string[];
}

export interface PortfolioRiskReport {
  generatedAt: string;
  positionCount: number;
  grossExposure: number;
  netExposure: number;
  /** Concentration reads with the math in the detail strings. */
  concentration: {
    top1Pct: number | null;
    top3Pct: number | null;
    hhi: number | null;
    label: "CONCENTRATED" | "MODERATE" | "DIVERSIFIED" | "N/A";
    detail: string;
  };
  correlation: {
    avgPairwise: number | null;
    pairsUsed: number;
    highPairs: CorrelationPair[];   // ρ ≥ 0.7, largest first
    clusters: { symbols: string[]; combinedWeightPct: number }[];
    detail: string;
  };
  positions: MarkedPosition[];       // sorted by exposure desc
  positionRisks: PositionRisk[];     // sorted by risk contribution desc
  flags: RiskFlag[];                 // sorted by severity
  /** Scenario P&L totals keyed by scenario id (USD, signed) — present
   *  only when a thesis-linked scenario set was supplied. */
  scenarioTotals: Partial<Record<ScenarioId, { total: number; modeled: number; unmodeled: number }>>;
  scenarioBasis: string;
  coverage: { markedPositions: number; modeledPositions: number; totalPositions: number };
}
