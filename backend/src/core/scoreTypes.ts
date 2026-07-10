/* ────────────────────────────────────────────────────────────────
   Composite-score domain types — sibling to core/types.ts (price)
   and core/corridorTypes.ts (corridor). Everything the scores module
   emits and the score repo/API/UI consume is defined here.

   A "score" is one named signal for a run day. It is EITHER a
   primitive (one component that is the signal itself, e.g. the
   Brent–WTI spread) OR a composite (several weighted components,
   e.g. Flow Stress = spread + export strength + stock draw +
   throughput). Both share this one shape so storage, the API and the
   UI treat them uniformly — a primitive is just a composite with a
   single component.

   Design rule carried from docs/scores-plan.md: a score NEVER hides
   its inputs. `components[]` is always populated and individually
   inspectable; `coverage` reports how many legs actually had data so
   the UI can be honest about a partially-live composite instead of
   pretending to a full reading.
──────────────────────────────────────────────────────────────── */

/** Scores we compute. Extend the array + union together. */
export const SCORE_IDS = [
  "brent_wti_spread", // primitive — derived from daily_prices, no new source
  "flow_stress", // composite — corridor product (Phase 1)
  "tightness", // composite — fundamentals (Phase 2)
  "macro_override", // composite — cross-market context (Phase 3)
] as const;
export type ScoreId = (typeof SCORE_IDS)[number];

export function isScoreId(x: string): x is ScoreId {
  return (SCORE_IDS as readonly string[]).includes(x);
}

/** Coarse read of a score's headline number, for UI colour/emphasis. */
export type ScoreStatus = "elevated" | "normal" | "muted" | "insufficient";

/**
 * One input leg of a score. `value`/`unit`/`asOf` describe the raw
 * datum for display; `normalized` is its 0..1 contribution to the
 * composite (higher = more of whatever the score measures). Both
 * `value` and `normalized` are null when the leg has no data yet —
 * that leg is then excluded from the composite and counted against
 * `coverage`, never silently treated as zero.
 */
export interface ScoreComponent {
  /** Stable slug, e.g. "brent_wti_spread", "export_strength". */
  key: string;
  /** Display label, e.g. "Brent–WTI spread". */
  label: string;
  /** Raw observed value in `unit`, for display. null = no data. */
  value: number | null;
  /** Display unit, e.g. "$/bbl", "%", "Mb/d". */
  unit: string;
  /** 0..1 normalized contribution. null = no data (leg skipped). */
  normalized: number | null;
  /** Relative weight within the composite (reweighted over live legs). */
  weight: number;
  /** As-of date of the underlying datum, YYYY-MM-DD. null = no data. */
  asOf: string | null;
  /** Optional short human note, e.g. "60d range $2.10–$6.40". */
  note?: string;
}

/** One computed score for a run day — the row score_snapshots stores. */
export interface ScoreSnapshot {
  scoreId: ScoreId;
  /** UTC calendar day the score is valid for. */
  runDate: string;
  /** 0..100 headline. null when inputs are insufficient. */
  score: number | null;
  status: ScoreStatus;
  /** Short badge label, e.g. "WIDE", "STRESSED", "PENDING". */
  label: string;
  /** One-line explanation — drives the tooltip / panel subtitle. */
  headline: string;
  /** Every leg, always present (even when value/normalized are null). */
  components: ScoreComponent[];
  /** available = legs with data; total = legs defined. Honesty gauge. */
  coverage: { available: number; total: number };
}
