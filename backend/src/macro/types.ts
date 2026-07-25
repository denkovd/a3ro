/* Macro layer — shared types for the FRED-driven growth × inflation
   regime (P·06) and the Macro Override "Macro pressure" half (#5).
   Pure-engine domain: no IO here. */

/** The four Darius-Dale-style GRID quadrants, by whether growth and
 *  inflation are ACCELERATING (rate-of-change / 2nd derivative), not
 *  their level. */
export type MacroQuadrant = "GOLDILOCKS" | "REFLATION" | "INFLATION" | "DEFLATION" | "PENDING";

export interface MacroAxisRead {
  /** Year-over-year change of the level (%). */
  yoy: number | null;
  /** Momentum: change in the YoY vs a prior window — sign = accel/decel. */
  momentum: number | null;
  /** True when momentum ≥ 0 (accelerating). null when insufficient data. */
  accelerating: boolean | null;
  asOf: string | null;
}

export interface MacroRegimeSnapshot {
  runDate: string;
  quadrant: MacroQuadrant;
  growth: MacroAxisRead;
  inflation: MacroAxisRead;
  /** One-line, plain-English read of the quadrant. */
  headline: string;
  /** What the quadrant has historically favored (context, not advice). */
  favored: string;
  coverage: { available: number; total: number }; // axes live / 2
}

/** Macro Override's POSITIONING half (P7) — managed-money net length
 *  in WTI + its 1-year percentile. A separate named data family from
 *  the macro (FRED) half; never silently folded into it. */
export type PositioningStance = "CROWDED_LONG" | "CROWDED_SHORT" | "NEUTRAL" | "PENDING";

export interface PositioningSnapshot {
  runDate: string;
  reportDate: string | null; // COT report Tuesday
  market: string;
  netLength: number | null; // managed-money longs − shorts
  longs: number | null;
  shorts: number | null;
  percentile1y: number | null; // 0..1 over the trailing ~52 weeks
  stance: PositioningStance;
  status: "live" | "insufficient";
  headline: string;
  coverage: { available: number; total: number }; // weeks on file vs the min needed
}

/* ── Liquidity / cost-of-capital layer (docs/regime-macro-refresh.md)
   The asset-neutral counterpart to MacroPressureSnapshot. Same shape
   of thinking — a 0..100 composite that never hides its legs — but
   scored as "how tight is global liquidity / how fast is the price of
   capital repricing", with no reference to any single asset. */

export interface LiquidityLeg {
  key: string;
  label: string;
  /** The observed quantity, in the leg's own units. */
  value: number | null;
  /** 0..1, higher = more stress. null = leg not live. */
  normalized: number | null;
  /** The scale, spelled out — every leg stays hand-checkable. */
  note: string;
  /** Where it came from, so the UI can mark live vs derived. */
  source: "fred" | "yahoo" | "derived";
}

export interface LiquidityStressSnapshot {
  runDate: string;
  /** 0..100, higher = tighter liquidity / faster repricing of capital. */
  score: number | null;
  status: "elevated" | "normal" | "muted" | "insufficient";
  /** Dale's 1998-style setup: composite stress high AND bond vol
   *  breaking out. Both must hold — a high composite on its own is a
   *  level read, the vol breakout is what makes it a repricing. */
  riskPremiumAlert: boolean;
  headline: string;
  legs: LiquidityLeg[];
  coverage: { available: number; total: number };
}

/** Nominal GDP vs its OWN trend windows — the "structurally elevated
 *  nominal GDP" leg. Trend means are computed from the same series,
 *  never asserted, so the comparison is internally consistent. */
export interface NominalGrowthSnapshot {
  runDate: string;
  asOf: string | null;
  /** Latest nominal GDP YoY, %. */
  yoy: number | null;
  /** Mean YoY over 2003–2007, %. */
  trend0307: number | null;
  /** Mean YoY over 2015–2019, %. */
  trend1519: number | null;
  /** yoy − trend1519, the "above trend" gap in pp. */
  gapToRecentTrend: number | null;
  aboveTrend: boolean | null;
  headline: string;
}

/* ── The six cycles ───────────────────────────────────────────────
   Dale's six, exactly: growth, inflation, POLICY (monetary and fiscal
   together — not two cycles), CORPORATE PROFITS, liquidity,
   positioning. The page previously showed monetary and fiscal as
   separate tiles and had no profits cycle at all.

   Each is scored tailwind / neutral / headwind FOR RISK ASSETS, which
   is the question the cycles exist to answer ("is the current regime
   sustainable"). */

export type CycleKey =
  | "growth"
  | "inflation"
  | "policy"
  | "profits"
  | "liquidity"
  | "positioning";

export type CycleScore = "TAILWIND" | "NEUTRAL" | "HEADWIND";

export interface CycleRead {
  key: CycleKey;
  label: string;
  score: CycleScore;
  /** Short human note — what the number is actually doing. */
  note: string;
  /** The driving quantity, when there is a single one. */
  value: number | null;
  /** Sub-reads, for cycles built from more than one series (policy). */
  detail?: { label: string; value: number | null; note: string }[];
  source: "live" | "brief";
  asOf: string | null;
}

export interface SixCyclesSnapshot {
  runDate: string;
  cycles: CycleRead[];
  tailwinds: number;
  headwinds: number;
  /** Plain-English sustainability read, in Dale's own framing. */
  headline: string;
}

/** Macro Override's macro half — a 0..100 pressure plus the divergence
 *  flag that makes the chip fire (oil rising while macro weakens). */
export interface MacroPressureSnapshot {
  runDate: string;
  score: number | null; // 0..100, higher = more macro headwind for oil
  status: "elevated" | "normal" | "muted" | "insufficient";
  diverging: boolean; // oil momentum ↑ while macro pressure high
  headline: string;
  components: {
    key: string;
    label: string;
    value: number | null;
    normalized: number | null;
    note: string;
  }[];
  coverage: { available: number; total: number };
}
