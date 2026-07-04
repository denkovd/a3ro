/* ────────────────────────────────────────────────────────────────
   Source registry — the ONLY place adapters are wired in.
   Priority/role/limits live on each adapter's descriptor; this file
   just instantiates and orders them.

   All deferred adapters (fred, yfinance, alphavantage) are now wired in.
   Paid upgrade path (later): oilpriceapi.ts / tradingeconomics.ts /
   bloomberg.ts drop in here exactly the same way — likely priority 1–2,
   kind: live, role: backbone. Nothing outside sources/ changes.
──────────────────────────────────────────────────────────────── */

import { OilPriceSource } from "./OilPriceSource";
import { EiaSource } from "./eia";
import { FredSource } from "./fred";
import { YFinanceSource } from "./yfinance";
import { AlphaVantageSource } from "./alphavantage";

export function buildSources(): OilPriceSource[] {
  const sources: OilPriceSource[] = [
    new EiaSource(),
    new FredSource(),
    new YFinanceSource(),
    new AlphaVantageSource(),
  ];
  return sources.sort((a, b) => a.descriptor.priority - b.descriptor.priority);
}

export function getSource(id: string): OilPriceSource | undefined {
  return buildSources().find((s) => s.descriptor.id === id);
}
