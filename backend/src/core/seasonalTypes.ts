/* ────────────────────────────────────────────────────────────────
   Week-of-year seasonal baseline — canonical domain type.
   Sibling to corridorTypes.ts's CorridorBaseline, but a different
   norm shape: instead of one 1y/5y aggregate per metric, this is one
   row per (metric, ISO week) holding the 5-year mean/min/max for
   that calendar week. This IS the "inventories vs 5-yr seasonal
   range" band in docs/scores-plan.md — the Tightness score reads the
   current week's row and asks where today's level sits inside it.

   Rows are fetched-from-provider aggregates (EIA 5y history via
   sources/eiaSeasonal.ts), NOT derived from corridor_metrics — same
   posture as corridor_baselines vs PortWatch (005_baselines.sql):
   the daily tables hold a short rolling window; norms need years.
──────────────────────────────────────────────────────────────── */

export interface SeasonalBaseline {
  /** Metric slug, matching corridor_metrics (e.g. "us_crude_stocks"). */
  metric: string;
  /** ISO-8601 week of year, 1..53 (core/time's isoWeekOf). */
  isoWeek: number;
  meanValue: number;
  minValue: number;
  maxValue: number;
  /** Observations behind this week's band (≈5 for a 5y sample). */
  sampleCount: number;
  sampleFrom: string; // YYYY-MM-DD
  sampleTo: string; // YYYY-MM-DD
  computedAt: string; // ISO timestamp
}
