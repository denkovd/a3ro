/* ────────────────────────────────────────────────────────────────
   EIA inventory adapter — US weekly WPSR national series.
   Sibling to sources/eiaCorridor.ts (same provider, same catalog-route
   pattern, same quirks). Started as the STOCKS family feeding Flow
   Stress's regional-stock-draw leg (docs/scores-plan.md, Phase 1);
   the P5 pack widened it to the full WPSR national set that Tightness
   consumes — gasoline/distillate/SPR stocks + US-total refinery
   utilization (the PADD 3 utilization stays in eiaCorridor.ts, which
   is scoped to US-Gulf-specific series).

   Storage note: records land in corridor_metrics under corridor
   "usgulf" — NOT a dedicated inventories table. This is the minimal
   stock-draw leg only; the full P5 inventories pack (SPR, gasoline,
   distillate, week-of-year seasonal norms) gets its own table when it
   ships. Riding corridor_metrics keeps this pass migration-free and
   gives the rows per-source ingestion isolation + /api/oil/corridors
   visibility with zero new machinery. Cushing is geographically PADD 2
   (Oklahoma), but it is the WTI delivery hub feeding Gulf exports, so
   "usgulf" is the corridor whose stress it describes.

   Both series live-verified 2026-07-11 against the v2 catalog route
   (same discipline that caught the WCREXUS2 seriesid 404 — see
   eiaCorridor.ts header; do not "simplify" to the seriesid endpoint):
     GET https://api.eia.gov/v2/petroleum/stoc/wstk/data/
       ?api_key=…&frequency=weekly&data[]=value
       &facets[series][]={SERIES}
       &sort[0][column]=period&sort[0][direction]=desc
       &length=10&start=YYYY-MM-DD
     → { response: { data: [ { period, series, value, units:"MBBL" } ] } }

   Series → metric mapping (all live-verified 2026-07-11):
   - WCESTUS1 ("U.S. Ending Stocks excluding SPR of Crude Oil",
     weekly, MBBL = thousand barrels)
       → metric "us_crude_stocks", canonical unit "Mbbl" (÷1000).
   - W_EPC0_SAX_YCUOK_MBBL ("Cushing, OK Ending Stocks excluding SPR
     of Crude Oil", weekly, MBBL)
       → metric "cushing_stocks", canonical unit "Mbbl" (÷1000).
   - WGTSTUS1 ("U.S. Ending Stocks of Total Gasoline", weekly, MBBL)
       → metric "gasoline_stocks", canonical unit "Mbbl" (÷1000).
   - WDISTUS1 ("U.S. Ending Stocks of Distillate Fuel Oil", weekly,
     MBBL) → metric "distillate_stocks", canonical unit "Mbbl" (÷1000).
   - WCSSTUS1 ("U.S. Ending Stocks of Crude Oil in SPR", weekly, MBBL)
       → metric "spr_stocks", canonical unit "Mbbl" (÷1000).
   - WPULEUS3 ("U.S. Percent Utilization of Refinery Operable
     Capacity", weekly, percent; route petroleum/pnp/wiup)
       → metric "us_refinery_utilization", canonical unit "%".

   Provider quirks (identical to eiaCorridor.ts, kept local because
   they are provider logic): value arrives number OR string OR null
   (null = gap row — skip, not an error); 403 is ambiguous between
   invalid key and throttled key (body text disambiguates); some error
   payloads come back 200 { error: "…" }; weekly series stamp the
   week-ENDING date as period.
──────────────────────────────────────────────────────────────── */

import { SourceErrorKind } from "../core/types";
import { CorridorMetricRecord } from "../core/corridorTypes";
import { CorridorBaseSource, CorridorSourceDescriptor } from "./CorridorSource";

const BASE_URL = "https://api.eia.gov/v2/";
const LOOKBACK_DAYS = 45; // ~6 weekly rows — covers the 4-week stock-draw delta with slack
const MAX_ROWS = 10; // ≥ LOOKBACK_DAYS/7, with slack for revisions

/** EIA stocks arrive in MBBL (thousand barrels); canonical display unit is Mbbl (millions). */
export function thousandBblToMillionBbl(thousandBbl: number): number {
  return thousandBbl / 1000;
}

export interface EiaInventorySeriesConfig {
  seriesId: string;
  /** v2 catalog route the series lives under (see header note). */
  route: string;
  metric: string;
  rawUnitFallback: string;
  toCanonical: (raw: number) => number;
  canonicalUnit: string;
}

/** Exported for eiaSeasonal.ts, which fetches 5-year history for a
 *  subset of these series — one mapping, never two (same pattern as
 *  portwatchBaselines.ts importing portwatch.ts's CHOKEPOINTS). */
export const INVENTORY_SERIES: EiaInventorySeriesConfig[] = [
  {
    seriesId: "WCESTUS1",
    route: "petroleum/stoc/wstk",
    metric: "us_crude_stocks",
    rawUnitFallback: "MBBL",
    toCanonical: thousandBblToMillionBbl,
    canonicalUnit: "Mbbl",
  },
  {
    seriesId: "W_EPC0_SAX_YCUOK_MBBL",
    route: "petroleum/stoc/wstk",
    metric: "cushing_stocks",
    rawUnitFallback: "MBBL",
    toCanonical: thousandBblToMillionBbl,
    canonicalUnit: "Mbbl",
  },
  {
    seriesId: "WGTSTUS1",
    route: "petroleum/stoc/wstk",
    metric: "gasoline_stocks",
    rawUnitFallback: "MBBL",
    toCanonical: thousandBblToMillionBbl,
    canonicalUnit: "Mbbl",
  },
  {
    seriesId: "WDISTUS1",
    route: "petroleum/stoc/wstk",
    metric: "distillate_stocks",
    rawUnitFallback: "MBBL",
    toCanonical: thousandBblToMillionBbl,
    canonicalUnit: "Mbbl",
  },
  {
    seriesId: "WCSSTUS1",
    route: "petroleum/stoc/wstk",
    metric: "spr_stocks",
    rawUnitFallback: "MBBL",
    toCanonical: thousandBblToMillionBbl,
    canonicalUnit: "Mbbl",
  },
  {
    seriesId: "WPULEUS3",
    route: "petroleum/pnp/wiup",
    metric: "us_refinery_utilization",
    rawUnitFallback: "%",
    toCanonical: (raw) => raw,
    canonicalUnit: "%",
  },
];

interface EiaInventoryRow {
  period: string; // "YYYY-MM-DD" — weekly series stamp the week-ending date
  series?: string; // catalog routes echo the series id per row
  value: number | string | null;
  units?: string;
}

interface EiaInventoryResponse {
  response?: { data: EiaInventoryRow[] };
  error?: string; // sometimes 200 + error body
  data?: { error?: string };
}

export class EiaInventorySource extends CorridorBaseSource {
  readonly descriptor: CorridorSourceDescriptor = {
    id: "eia-inventories",
    name: "U.S. Energy Information Administration — US weekly petroleum stocks (WPSR)",
    confidence: "official",
    corridors: ["usgulf"],
    expectedCadenceMs: 7 * 86_400_000, // WPSR publishes weekly
    rateLimit: {
      // Same EIA account/key as eia.ts / eiaCorridor.ts — stay far
      // below any plausible ceiling.
      maxPerHour: 500,
      minIntervalMs: 60_000,
    },
  };

  constructor(private readonly apiKey = process.env.EIA_API_KEY ?? "") {
    super();
  }

  async fetchLatest(): Promise<CorridorMetricRecord[]> {
    const records: CorridorMetricRecord[] = [];
    // Sequential is fine: six weekly-cadence calls, no rate pressure.
    for (const cfg of INVENTORY_SERIES) {
      const rows = await this.request(cfg);
      for (const row of rows) {
        const rec = this.rowToRecord(cfg, row);
        if (rec) records.push(rec);
      }
      // A series returning zero usable rows is not an error.
    }
    return records;
  }

  /* ── provider-specific plumbing (mirrors eiaCorridor.ts) ────── */

  private buildUrl(cfg: EiaInventorySeriesConfig): string {
    if (!this.apiKey) this.fail("auth", "EIA_API_KEY is not set");
    const start = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const p = new URLSearchParams();
    p.set("api_key", this.apiKey);
    p.set("frequency", "weekly");
    p.append("data[]", "value");
    p.append("facets[series][]", cfg.seriesId);
    p.set("sort[0][column]", "period");
    p.set("sort[0][direction]", "desc");
    p.set("length", String(MAX_ROWS));
    p.set("start", start);
    return `${BASE_URL}${cfg.route}/data/?${p.toString()}`;
  }

  private async request(cfg: EiaInventorySeriesConfig): Promise<EiaInventoryRow[]> {
    const url = this.buildUrl(cfg);
    const body = await this.getJson<EiaInventoryResponse>(url, {
      classifyHttpError: (status, text) => this.classify403(status, text),
    });

    // EIA occasionally reports errors inside a 200 body.
    const inlineError = body.error ?? body.data?.error;
    if (inlineError) {
      this.fail(this.textToKind(inlineError), `EIA error body: ${inlineError}`);
    }
    if (!body.response || !Array.isArray(body.response.data)) {
      this.fail(
        "bad_payload",
        `unexpected EIA response shape: ${JSON.stringify(body).slice(0, 200)}`,
      );
    }
    return body.response.data;
  }

  /** 403 is ambiguous at EIA: suspended (throttled) key vs invalid key. */
  private classify403(status: number, text: string): SourceErrorKind | undefined {
    if (status !== 403) return undefined;
    return this.textToKind(text);
  }

  private textToKind(text: string): SourceErrorKind {
    const t = text.toLowerCase();
    if (/(exceed|throttl|too many|suspend|rate)/.test(t)) return "rate_limited";
    if (/(api.?key|invalid|unauthor|registered)/.test(t)) return "auth";
    return "upstream_error";
  }

  private rowToRecord(
    cfg: EiaInventorySeriesConfig,
    row: EiaInventoryRow,
  ): CorridorMetricRecord | null {
    // Catalog routes echo the series id per row — defensively skip
    // any row that isn't the series we asked for.
    if (row.series !== undefined && row.series !== cfg.seriesId) return null;

    // null values appear for gaps/holidays — skip, not an error.
    if (row.value === null || row.value === undefined || row.value === "") return null;

    const rawNumber = typeof row.value === "number" ? row.value : Number(row.value);
    if (!Number.isFinite(rawNumber)) return null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.period)) {
      this.fail("bad_payload", `EIA period "${row.period}" is not a calendar date`);
    }

    return {
      corridor: "usgulf",
      metric: cfg.metric,
      value: cfg.toCanonical(rawNumber),
      unit: cfg.canonicalUnit,
      periodDate: row.period,
      // WPSR publication timing is not modeled in v1 (see eiaCorridor.ts).
      observedAt: `${row.period}T00:00:00.000Z`,
      source: this.descriptor.id,
      confidence: this.descriptor.confidence,
      fetchedAt: new Date().toISOString(),
      raw: { value: rawNumber, unit: row.units || cfg.rawUnitFallback },
      meta: { seriesId: cfg.seriesId, endpoint: cfg.route },
    };
  }
}
