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
