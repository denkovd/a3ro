/* ────────────────────────────────────────────────────────────────
   Bagholder Risk Map — shared types for the five-layer scoring
   engine and the trigger/invalidator state machine (P·08). Pure
   domain: no IO here (mirrors thesis/types.ts).

   Design rule carried through every shape, same as Thesis Lab: NO
   OPAQUE SCORES. Every layer score carries `components` — named,
   signed contributions that sum to the score — and every `coverage`
   names live-vs-total inputs so a thin-data layer is flagged, never
   silently treated the same as a fully-live one.

   See bagholder-trigger-trade-architecture.md for the full spec this
   module implements (§2 core framework, §3 scoring model, §4 trigger
   taxonomy, §5 data model, §9 trade object).
──────────────────────────────────────────────────────────────── */

/* ── narratives & events ──────────────────────────────────────── */

export type NarrativeCategory = "CRYPTO" | "EQUITY" | "MACRO" | "COMMODITY" | "CROSS_ASSET";
export type PrimaryDirection = "bullish" | "bearish" | "mixed";
export type NarrativeStatus = "active" | "dormant" | "resolved";

export interface Narrative {
  id: number;
  slug: string;
  headline: string;
  firstSeenAt: string;       // ISO — the narrative's true origin, not a post date
  category: NarrativeCategory;
  primaryDirection: PrimaryDirection;
  status: NarrativeStatus;
  createdAt: string;
}

export type SourceType = "X_POST" | "NEWS" | "FILING" | "ONCHAIN" | "OTHER";

export interface NarrativeEvent {
  id: number;
  narrativeId: number;
  sourceType: SourceType;
  sourceUrl: string | null;
  author: string | null;
  authorWeight: number | null;   // 0..1 credibility/reach prior
  postedAt: string;              // ISO
  text: string | null;
  replyAgree: number;
  replyDisagree: number;
  replyReframe: number;          // "point 2 affects miners more than BTC" — a reframe, not agree/disagree
  hedgeDetected: boolean;
  createdAt: string;
}

/* ── assets ────────────────────────────────────────────────────── */

export type AssetClass = "CRYPTO" | "MINER_EQUITY" | "AI_INFRA_EQUITY" | "MACRO_PROXY" | "COMMODITY" | "EQUITY";
export type AssetRole = "UNDERLYING" | "INFRA" | "SUBSTITUTE" | "BENCHMARK";

export interface AssetRef {
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  role: AssetRole;
}

export type ExposureType = "DIRECT" | "INDIRECT_INFRA" | "SUBSTITUTE" | "BENCHMARK";
export type ImpliedDirection = "long" | "short";

export interface NarrativeAssetLink {
  narrativeId: number;
  symbol: string;
  exposureType: ExposureType;
  impliedDirection: ImpliedDirection | null;
}

/* ── scoring ───────────────────────────────────────────────────── */

export type Timeframe = "INTRADAY" | "SWING" | "MULTI_WEEK";
export type LayerKey = "macro" | "narrative" | "positioning" | "opportunity" | "confidence";

/** One line of a layer's score math — shown verbatim in the UI,
 *  same discipline as Thesis Lab's StrengthComponent. */
export interface ScoreComponent {
  key: string;
  label: string;
  effect: number;   // signed contribution
  detail: string;
}

export interface LayerScore {
  score: number;                                   // 0..100, clipped
  coverage: { available: number; total: number };  // live inputs / total, this layer
  components: ScoreComponent[];
}

export type CompositeBand = "no_trade" | "watchlist" | "setup_forming" | "live_trigger";

export interface CompositeResult {
  raw: number;                 // wM·M + wN·N + wP·P + wO·O
  final: number;                // raw × (0.5 + 0.5×C/100)
  band: CompositeBand;
  confidenceMultiplier: number; // the 0.5..1.0 dampener actually applied
}

export interface BagholderAnalysis {
  narrativeId: number;
  timeframe: Timeframe;
  layers: {
    macro: LayerScore;
    narrative: LayerScore;
    positioning: LayerScore;
    opportunity: LayerScore;
    confidence: LayerScore;
  };
  composite: CompositeResult;
  coverage: { available: number; total: number }; // aggregate across all layers
  computedAt: string;
}

/* ── market context (assembled by marketContext.ts, consumed pure) ── */

export interface AssetPositioningRead {
  symbol: string;
  indicatorType: string;
  value: number;
  percentile1y: number | null;
  stance: string | null;
  reportDate: string;
}

export interface AssetPerformanceRead {
  symbol: string;
  closeSeries: { date: string; close: number }[];
  rsVsBenchmark: number | null;    // symbol return − benchmark return, trailing window, fraction
  realizedDailySigma: number | null;
}

/** Everything the pure engine may read. Every field nullable/empty —
 *  a missing feed degrades to an honest "no_data" contribution, never
 *  an invented number (house truth rule, same as Thesis Lab). */
export interface BagholderContext {
  asOf: string;
  macro: {
    quadrant: string;
    pressureScore: number | null;
    growthMomentum: number | null;
    inflationMomentum: number | null;
    runDate: string;
  } | null;
  positioning: AssetPositioningRead[];
  performance: AssetPerformanceRead[];
  benchmarkSymbol: string;
}

/* ── trigger state machine ────────────────────────────────────── */

export type TriggerTaxonomy =
  | "LATE_NARRATIVE_FADE"
  | "MOMENTUM_TRAP"
  | "FORCED_ROTATION"
  | "MINER_RERATING"
  | "STRUCTURAL_CYCLICAL_MISMATCH";

export type TriggerStateId = "WATCHLIST" | "SETUP_FORMING" | "LIVE_TRIGGER" | "INVALIDATED" | "EXPIRED";
export type TriggerDirection = "long" | "short" | "pair" | "basket" | "no_trade";

export interface TriggerConditionSpec {
  condition: string;               // human-readable rule, e.g. "composite_final >= 75 sustained 2 cycles"
  [k: string]: unknown;
}

export interface InvalidationSpec {
  type: string;                    // e.g. "spread_reversion" | "price_level" | "time_stop"
  condition: string;
  timeStop?: string;               // ISO date
  [k: string]: unknown;
}

export interface Trigger {
  id: number;
  narrativeId: number;
  taxonomy: TriggerTaxonomy;
  state: TriggerStateId;
  direction: TriggerDirection | null;
  primarySymbol: string | null;
  triggerCondition: TriggerConditionSpec;
  invalidation: InvalidationSpec;
  timeframe: Timeframe;
  sustainCycles: number;
  enteredStateAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerEvent {
  id: number;
  triggerId: number;
  fromState: TriggerStateId | null;
  toState: TriggerStateId;
  reason: string;
  evidence: unknown[];
  createdAt: string;
}

/* ── trade object (§9) ────────────────────────────────────────── */

export interface TradeObjectLeg {
  symbol: string;
  side: "long" | "short";
  weight: number;
}

export interface TradeObject {
  triggerId: number;
  setupName: string;
  taxonomy: TriggerTaxonomy;
  direction: TriggerDirection;
  targetAssets: string[];
  legs: TradeObjectLeg[];
  timeframe: Timeframe;
  entryLogic: TriggerConditionSpec;
  invalidation: InvalidationSpec;
  scores: { macro: number; narrative: number; positioning: number; opportunity: number; confidence: number };
  compositeFinal: number;
  confidence: number;
  bagholderSide: string;
  notes: string;
  createdAt: string;
}

/* ── board view (what the API/UI actually consumes) ───────────── */

export interface TriggerBoardEntry {
  trigger: Trigger;
  narrative: Narrative;
  latestSnapshot: {
    runDate: string;
    layers: BagholderAnalysis["layers"];
    composite: CompositeResult;
    coverage: { available: number; total: number };
  } | null;
}
