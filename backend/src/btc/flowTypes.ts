/* ────────────────────────────────────────────────────────────────
   BTC stock/flow domain types — mirrors gold/flowTypes.ts. MVP scope
   is one locus (the aggregate US spot ETF venue already on the BTC
   Tracker globe, btc/nodes.ts's "etf_us"); extend both arrays together
   if per-fund or exchange-netflow loci are ever added.
──────────────────────────────────────────────────────────────── */

export const BTC_LOCI = ["etf_us"] as const;
export type BtcLocusId = (typeof BTC_LOCI)[number];

export const BTC_FLOW_METRICS = ["etf_flow_usd_mn", "etf_holdings_usd_mn"] as const;
export type BtcFlowMetricId = (typeof BTC_FLOW_METRICS)[number];

export interface BtcFlowMetricRow {
  locus: string;
  metric: string;
  periodDate: string;
  value: number;
  unit: string;
  source: string;
  observedAt: string;
  meta: Record<string, unknown>;
}

export function isBtcLocusId(v: string): v is BtcLocusId {
  return (BTC_LOCI as readonly string[]).includes(v);
}
