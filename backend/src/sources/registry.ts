/* ────────────────────────────────────────────────────────────────
   Source registry — the ONLY place adapters are wired in.
   Priority/role/limits live on each adapter's descriptor; this file
   just instantiates and orders them.

   TODO (deferred, mechanical — copy sources/eia.ts):
   ┌────────────────┬──────────┬────────────┬────────────┬─────────────────────────────┐
   │ file           │ priority │ confidence │ role       │ notes                       │
   ├────────────────┼──────────┼────────────┼────────────┼─────────────────────────────┤
   │ fred.ts        │ 2        │ official   │ backbone   │ series DCOILWTICO /         │
   │                │          │            │            │ DCOILBRENTEU; 120 req/min;  │
   │                │          │            │            │ kind: settlement            │
   │ yfinance.ts    │ 3        │ unofficial │ supplement │ CL=F, BZ=F front-month      │
   │                │          │            │            │ futures; kind: live; NO KEY,│
   │                │          │            │            │ breaks silently — expect    │
   │                │          │            │            │ bad_payload often           │
   │ alphavantage.ts│ 4        │ aggregator │ reserve    │ WTI/BRENT functions; free   │
   │                │          │            │            │ tier 25 req/DAY + 5/min —   │
   │                │          │            │            │ poll only when backbone is  │
   │                │          │            │            │ stale (RULES.md §2.4)       │
   └────────────────┴──────────┴────────────┴────────────┴─────────────────────────────┘

   Paid upgrade path (later): oilpriceapi.ts / tradingeconomics.ts /
   bloomberg.ts drop in here exactly the same way — likely priority 1–2,
   kind: live, role: backbone. Nothing outside sources/ changes.
──────────────────────────────────────────────────────────────── */

import { OilPriceSource } from "./OilPriceSource";
import { EiaSource } from "./eia";

export function buildSources(): OilPriceSource[] {
  const sources: OilPriceSource[] = [
    new EiaSource(),
    // new FredSource(),
    // new YFinanceSource(),
    // new AlphaVantageSource(),
  ];
  return sources.sort((a, b) => a.descriptor.priority - b.descriptor.priority);
}

export function getSource(id: string): OilPriceSource | undefined {
  return buildSources().find((s) => s.descriptor.id === id);
}
