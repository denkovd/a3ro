/* ────────────────────────────────────────────────────────────────
   Commodity brief for the weekly newsletter. Open data only.

   Brief: significant changes only. A reading makes the brief when it
   crosses its threshold; a quiet week says so in one line.
     oil chokepoint transits   |7-day avg vs the 7 before| ≥ 15%   (IMF PortWatch)
     US crude stocks           |weekly change| ≥ 4 million barrels (EIA)
     WTI spot                  |5-session change| ≥ 5%             (EIA)
     COMEX copper stocks       |day-on-day change| ≥ 3%            (CME)
     ABS exports (iron ore,    a new month since the last issue    (ABS MERCH_EXP)
       copper, LNG)            with |m/m| ≥ 15%

   Red flags: ongoing disturbances, listed under the brief until resolved.
     auto    a chokepoint whose 7-day transits sit 30% or more below its
             1-year median (raised and cleared by the data)
     manual  added or resolved by the owner in Admin → Newsletter

   Pure functions here; gatherCommodity (DB) and the extras the admin
   route fetches from lib/ (copper stocks, ABS exports) feed them.
──────────────────────────────────────────────────────────────── */

export const COMMODITY_RULES = {
  chokepointWowPct: 15, crudeStocksMb: 4, wtiPct: 5, copperStocksPct: 3, exportsMomPct: 15,
  redFlagBelowNormal: 0.7,
} as const;

export interface ChokepointRead { id: string; name: string; last7: number; prior7: number; changePct: number; through: string; normal: number | null }
export interface ExportRead { id: string; label: string; latestPeriod: string; latestAudM: number; prevAudM: number | null }
export interface CopperStocksRead { reportDate: string | null; total: number; prevTotal: number | null }

export interface CommodityInputs {
  chokepoints: ChokepointRead[];
  crudeStocks: { value: number; change: number | null; date: string } | null;
  wti: { value: number; change: number | null; date: string } | null;
  copperStocks: CopperStocksRead | null;
  exports: ExportRead[];
  /** Latest ABS period per export id as of the previous issue: a new month is news once. */
  previousExportPeriods: Record<string, string>;
}

export interface BriefItem { commodity: string; text: string }

const sign = (n: number, dp = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)}`;
const month = (p: string) => new Date(`${p.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

export function commodityBrief(i: CommodityInputs): BriefItem[] {
  const R = COMMODITY_RULES;
  const out: BriefItem[] = [];
  for (const c of i.chokepoints) {
    if (Math.abs(c.changePct) >= R.chokepointWowPct) {
      out.push({ commodity: "Oil", text: `${c.name} tanker transits ${c.changePct > 0 ? "up" : "down"} ${Math.abs(c.changePct).toFixed(0)}% week on week, to ${c.last7.toFixed(1)} a day (to ${c.through}).` });
    }
  }
  if (i.crudeStocks?.change != null && Math.abs(i.crudeStocks.change) >= R.crudeStocksMb) {
    out.push({ commodity: "Oil", text: `US crude stocks ${i.crudeStocks.change > 0 ? "built" : "drew"} ${Math.abs(i.crudeStocks.change).toFixed(1)} million barrels to ${i.crudeStocks.value.toFixed(1)} million (EIA, week to ${i.crudeStocks.date}).` });
  }
  if (i.wti?.change != null && i.wti.value - i.wti.change > 0) {
    const p = (i.wti.change / (i.wti.value - i.wti.change)) * 100;
    if (Math.abs(p) >= R.wtiPct) out.push({ commodity: "Oil", text: `WTI ${sign(p)}% over five sessions to US$${i.wti.value.toFixed(2)} (EIA, ${i.wti.date}).` });
  }
  if (i.copperStocks?.prevTotal && i.copperStocks.prevTotal > 0) {
    const p = (i.copperStocks.total / i.copperStocks.prevTotal - 1) * 100;
    if (Math.abs(p) >= R.copperStocksPct) out.push({ commodity: "Copper", text: `COMEX copper stocks ${sign(p)}% in a day to ${Math.round(i.copperStocks.total).toLocaleString("en-AU")} short tons${i.copperStocks.reportDate ? ` (${i.copperStocks.reportDate})` : ""}.` });
  }
  for (const e of i.exports) {
    const isNew = i.previousExportPeriods[e.id] !== undefined && i.previousExportPeriods[e.id] < e.latestPeriod;
    if (!isNew || !e.prevAudM || e.prevAudM <= 0) continue;
    const p = (e.latestAudM / e.prevAudM - 1) * 100;
    if (Math.abs(p) >= R.exportsMomPct) out.push({ commodity: e.label, text: `Australia's ${e.label.toLowerCase()} exports ${sign(p, 0)}% month on month in ${month(e.latestPeriod)}, to A$${(e.latestAudM / 1000).toFixed(2)}bn (ABS).` });
  }
  return out;
}

export interface AutoFlag { autoKey: string; commodity: string; title: string; detail: string }

/** Chokepoints far below their 1-year normal: ongoing disturbances, not one bad week. */
export function autoRedFlags(chokepoints: ChokepointRead[]): AutoFlag[] {
  return chokepoints.flatMap((c) => {
    if (!c.normal || c.normal <= 0 || c.last7 >= c.normal * COMMODITY_RULES.redFlagBelowNormal) return [];
    const below = Math.round((1 - c.last7 / c.normal) * 100);
    return [{ autoKey: `chokepoint:${c.id}`, commodity: "Oil", title: `${c.name} transits ${below}% below normal`,
      detail: `${c.last7.toFixed(1)} tanker transits a day over the last 7 days against a 1-year median of ${c.normal.toFixed(1)} (to ${c.through}).` }];
  });
}

/** Median of a list; null when empty. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
