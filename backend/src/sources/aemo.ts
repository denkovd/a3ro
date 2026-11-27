/* ────────────────────────────────────────────────────────────────
   AEMO National Electricity Market prices (roadmap #90). AEMO allows
   any use with attribution (AEMO copyright permissions). One CSV per
   region per month of 5-minute spot prices (RRP, $/MWh) and demand;
   we take the demand-weighted average over the five regions.
──────────────────────────────────────────────────────────────── */
import type { AustraliaIndicator, AustraliaObservation } from "../australia/types";
import { AUSTRALIA_REGISTRY } from "../australia/registry";

export const NEM_REGIONS = ["NSW1", "QLD1", "VIC1", "SA1", "TAS1"] as const;
export const aemoUrl = (month: string, region: string) => `https://aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${month.replace("-", "")}_${region}.csv`;
const UA = { "User-Agent": "A3RO-Intelligence/1.0 (+https://a3ro.com.au)" };

/** Sum of price × demand and of demand, over one region-month file. */
export function sumCsv(csv: string): { pd: number; d: number; n: number } {
  const lines = csv.split(/\r?\n/);
  const head = (lines[0] ?? "").split(",").map((h) => h.trim().toUpperCase());
  const iD = head.indexOf("TOTALDEMAND"), iP = head.indexOf("RRP");
  if (iD < 0 || iP < 0) throw new Error("AEMO: unexpected columns");
  let pd = 0, d = 0, n = 0;
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const dem = Number(c[iD]), p = Number(c[iP]);
    if (!Number.isFinite(dem) || !Number.isFinite(p) || dem <= 0) continue;
    pd += p * dem; d += dem; n++;
  }
  return { pd, d, n };
}

/** The last `count` months, newest last, as "YYYY-MM" (the current month included only after its 3rd day). */
export function recentMonths(now: Date, count: number): string[] {
  const out: string[] = [];
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (now.getUTCDate() <= 3 ? 1 : 0), 1));
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function fetchAemoSeries(indicator: AustraliaIndicator, opts: { fetchImpl?: typeof fetch; now?: Date; months?: number } = {}): Promise<AustraliaObservation[]> {
  const def = AUSTRALIA_REGISTRY[indicator];
  const now = opts.now ?? new Date();
  const retrievedAt = now.toISOString();
  const months = recentMonths(now, opts.months ?? def.rollingPeriods);
  const out: AustraliaObservation[] = [];
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  for (const month of months) {
    let pd = 0, d = 0, regions = 0;
    for (const region of NEM_REGIONS) {
      const res = await (opts.fetchImpl ?? fetch)(aemoUrl(month, region), { headers: UA, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) continue;
      const s = sumCsv(await res.text());
      if (s.n) { pd += s.pd; d += s.d; regions++; }
    }
    if (regions < NEM_REGIONS.length || d <= 0) continue; // a month counts only with all five regions
    out.push({
      indicator, title: def.title, value: Math.round((pd / d) * 100) / 100, unit: def.unit, unitMultiplier: def.unitMultiplier,
      frequency: def.frequency, adjustment: def.adjustment, referencePeriod: month, sourceUrl: aemoUrl(month, "NSW1").replace("_NSW1", "_<REGION>"),
      publicationDate: null, sourceStatus: month === current ? "Month to date" : null,
      sourceComment: "Demand-weighted average of 5-minute spot prices, five NEM regions (A3RO calculation)",
      firstRetrievedAt: retrievedAt, lastVerifiedAt: retrievedAt,
    });
  }
  if (!out.length) throw new Error("AEMO: no complete months");
  return out;
}
