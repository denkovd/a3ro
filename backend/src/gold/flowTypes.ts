/* ────────────────────────────────────────────────────────────────
   Gold stock/flow domain types — client-mirrored in the UI where
   needed (type-only imports). Loci match gold/holders.ts pins.
──────────────────────────────────────────────────────────────── */

export const GOLD_LOCI = [
  "etf_us",
  "etf_global",
  "comex",
  "lbma",
  "zurich",
  "shanghai",
  "dubai",
  "cb_us",
  "cb_china",
  "cb_india",
  "cb_euro",
  "network",
] as const;

export type GoldLocusId = (typeof GOLD_LOCI)[number];

export const GOLD_FLOW_METRICS = [
  "etf_holdings_t",
  "etf_flow_t",
  "comex_registered_toz",
  "comex_eligible_toz",
  "comex_combined_toz",
  "comex_registered_delta_toz",
] as const;

export type GoldFlowMetricId = (typeof GOLD_FLOW_METRICS)[number];

export interface GoldFlowMetricRow {
  locus: string;
  metric: string;
  periodDate: string;
  value: number;
  unit: string;
  source: string;
  observedAt: string;
  meta: Record<string, unknown>;
}

export function isGoldLocusId(v: string): v is GoldLocusId {
  return (GOLD_LOCI as readonly string[]).includes(v);
}
