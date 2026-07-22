/* ────────────────────────────────────────────────────────────────
   World Gold Council free ETF holdings + flows (GoldHub chart API).
   Keyless JSON endpoints used by gold.org/goldhub/data pages.

   Holdings: weekly regional tonnes (North America ≈ US-listed gold ETFs
   aggregate including GLD/IAU-class; not a single-fund pin).
   Flow: week-over-week Δ holdings (tonnes) — honest proxy when USD
   flow series is not converted.

   Probed live 2026-07-21: holdings-chart2 returns Weekly.tonnes.set.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { getJsonForSource } from "./http";
import type { GoldFlowMetricInput } from "../storage/goldFlowRepo";

const SOURCE_ID = "wgc-etf";
const HOLDINGS_URL =
  "https://fsapi.gold.org/api/v11/charts/etfv2/revised/holdings-chart2";

export interface WgcHoldingsPoint {
  date: string; // YYYY-MM-DD
  northAmericaT: number | null;
  europeT: number | null;
  asiaT: number | null;
  otherT: number | null;
  totalT: number | null;
  goldUsdOz: number | null;
}

interface WgcHoldingsResponse {
  chartData?: {
    data?: {
      Weekly?: {
        tonnes?: {
          columns?: string[];
          set?: Array<Array<number | null>>;
        };
      };
    };
  };
}

function toDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Pure parse — fixture-tested. */
export function parseWgcHoldingsChart(body: WgcHoldingsResponse): WgcHoldingsPoint[] {
  const set = body.chartData?.data?.Weekly?.tonnes?.set;
  if (!set || !Array.isArray(set) || set.length === 0) {
    throw new SourceError(SOURCE_ID, "bad_payload", "WGC holdings chart missing Weekly.tonnes.set");
  }
  const out: WgcHoldingsPoint[] = [];
  for (const row of set) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const ts = row[0];
    if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
    const na = num(row[1]);
    const eu = num(row[2]);
    const asia = num(row[3]);
    const other = num(row[4]);
    const parts = [na, eu, asia, other].filter((x): x is number => x != null);
    const total = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;
    out.push({
      date: toDateStr(ts),
      northAmericaT: na,
      europeT: eu,
      asiaT: asia,
      otherT: other,
      totalT: total,
      goldUsdOz: num(row[5]),
    });
  }
  if (out.length === 0) {
    throw new SourceError(SOURCE_ID, "bad_payload", "WGC holdings chart produced zero usable rows");
  }
  return out;
}

export async function fetchWgcEtfHoldings(): Promise<WgcHoldingsPoint[]> {
  const body = await getJsonForSource<WgcHoldingsResponse>(SOURCE_ID, HOLDINGS_URL, {
    timeoutMs: 20_000,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; a3ro-gold-tracker/1.0)",
      Accept: "application/json",
      Referer: "https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows",
    },
  });
  return parseWgcHoldingsChart(body);
}

/** Map holdings history → gold_flow_metrics rows (holdings + weekly flow Δ). */
export function wgcHoldingsToMetrics(points: WgcHoldingsPoint[]): GoldFlowMetricInput[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const rows: GoldFlowMetricInput[] = [];
  let prevNa: number | null = null;
  let prevTotal: number | null = null;

  for (const p of sorted) {
    if (p.northAmericaT != null) {
      rows.push({
        locus: "etf_us",
        metric: "etf_holdings_t",
        periodDate: p.date,
        value: p.northAmericaT,
        unit: "tonnes",
        source: SOURCE_ID,
        meta: {
          region: "North America",
          note: "WGC regional gold-ETF holdings (not single-fund GLD)",
          goldUsdOz: p.goldUsdOz,
        },
      });
      if (prevNa != null) {
        rows.push({
          locus: "etf_us",
          metric: "etf_flow_t",
          periodDate: p.date,
          value: p.northAmericaT - prevNa,
          unit: "tonnes",
          source: SOURCE_ID,
          meta: { kind: "week_over_week_holdings_delta", region: "North America" },
        });
      }
      prevNa = p.northAmericaT;
    }
    if (p.totalT != null) {
      rows.push({
        locus: "etf_global",
        metric: "etf_holdings_t",
        periodDate: p.date,
        value: p.totalT,
        unit: "tonnes",
        source: SOURCE_ID,
        meta: {
          region: "Global",
          note: "WGC sum of NA+EU+Asia+Other gold-ETF holdings",
          goldUsdOz: p.goldUsdOz,
        },
      });
      if (prevTotal != null) {
        rows.push({
          locus: "etf_global",
          metric: "etf_flow_t",
          periodDate: p.date,
          value: p.totalT - prevTotal,
          unit: "tonnes",
          source: SOURCE_ID,
          meta: { kind: "week_over_week_holdings_delta", region: "Global" },
        });
      }
      prevTotal = p.totalT;
    }
  }
  return rows;
}
