/* ────────────────────────────────────────────────────────────────
   EIA spot-product adapter — daily refined-product + crude spot
   prices for the crack-spread leg of Tightness (docs/scores-plan.md
   sequencing #4). Sibling to sources/eiaInventory.ts (same provider,
   same v2 catalog-route pattern, same quirks); this one rides the
   petroleum/pri/spt route (spot prices), not the stocks route.

   Why spot, not futures: EIA's WTI futures series (RCLC1–RCLC4, route
   petroleum/pri/fut) were live-probed 2026-07-11 and are DISCONTINUED
   — newest row 2024-04-05. So the crack spread is built from EIA spot
   product prices instead, all three series live-verified 2026-07-11:

     GET https://api.eia.gov/v2/petroleum/pri/spt/data/
       ?api_key=…&frequency=daily&data[]=value
       &facets[series][]={SERIES}
       &sort[0][column]=period&sort[0][direction]=desc&length=6
     → { response: { data: [ { period, series, value, units } ] } }

   Series → metric mapping (all live-verified 2026-07-11):
   - EER_EPMRU_PF4_Y35NY_DPG ("New York Harbor Conventional Gasoline
     Regular Spot Price FOB", daily, $/GAL) → metric "gasoline_spot",
     canonical unit "$/bbl" (×42).
   - EER_EPD2F_PF4_Y35NY_DPG ("New York Harbor No. 2 Heating Oil Spot
     Price FOB", daily, $/GAL) → metric "heating_oil_spot",
     canonical unit "$/bbl" (×42).
   - RWTC ("Cushing, OK WTI Spot Price FOB", daily, $/BBL) → metric
     "wti_spot", canonical unit "$/bbl" (×1). Fetched here — rather
     than reused from daily_prices — so the crude leg of the crack
     shares EIA's exact date with the two products (no cross-source
     date drift in the 3:2:1 margin).

   Storage note: rows land in corridor_metrics under corridor "usgulf"
   (same rationale as eiaInventory.ts — the crack is a Gulf-refining
   margin signal feeding Tightness, which reads usgulf). NY Harbor is
   the standard NYMEX-deliverable crack benchmark; the geographic label
   is documented here, same as Cushing being PADD 2 in eiaInventory.ts.
   No migration — rides existing tables, per-source ingestion isolation
   and /api/oil/corridors visibility for free.

   Provider quirks (identical to eiaInventory.ts): value arrives number
   OR string OR null (null = gap/holiday row — skip, not an error);
   403 is ambiguous between invalid and throttled key (body text
   disambiguates); some error payloads come back 200 { error: "…" };
   spot series publish on business days with a T+1…T+4 lag.
──────────────────────────────────────────────────────────────── */

import { SourceErrorKind } from "../core/types";
import { CorridorMetricRecord } from "../core/corridorTypes";
import { CorridorBaseSource, CorridorSourceDescriptor } from "./CorridorSource";

const BASE_URL = "https://api.eia.gov/v2/";
const ROUTE = "petroleum/pri/spt";
const LOOKBACK_DAYS = 15; // ~a week of business days, covering the T+1…T+4 lag
const MAX_ROWS = 6;

/** Refined-product spot prices arrive in $/gal; the crack works in
 *  $/bbl. 42 US gallons per barrel is the exact NYMEX convention. */
export const GALLONS_PER_BARREL = 42;
export function dollarsPerGallonToPerBarrel(perGallon: number): number {
  return perGallon * GALLONS_PER_BARREL;
}

export interface EiaSpotSeriesConfig {
  seriesId: string;
  metric: string;
  rawUnitFallback: string;
  toCanonical: (raw: number) => number;
  canonicalUnit: string;
}

export const SPOT_PRODUCT_SERIES: EiaSpotSeriesConfig[] = [
  {
    seriesId: "EER_EPMRU_PF4_Y35NY_DPG",
    metric: "gasoline_spot",
    rawUnitFallback: "$/GAL",
    toCanonical: dollarsPerGallonToPerBarrel,
    canonicalUnit: "$/bbl",
  },
  {
    seriesId: "EER_EPD2F_PF4_Y35NY_DPG",
    metric: "heating_oil_spot",
    rawUnitFallback: "$/GAL",
    toCanonical: dollarsPerGallonToPerBarrel,
    canonicalUnit: "$/bbl",
  },
  {
    seriesId: "RWTC",
    metric: "wti_spot",
    rawUnitFallback: "$/BBL",
    toCanonical: (raw) => raw,
    canonicalUnit: "$/bbl",
  },
];

interface EiaSpotRow {
  period: string; // "YYYY-MM-DD" at frequency=daily
  series?: string; // catalog route echoes the series id per row
  value: number | string | null;
  units?: string;
}

interface EiaSpotResponse {
  response?: { data: EiaSpotRow[] };
  error?: string; // sometimes 200 + error body
  data?: { error?: string };
}

export class EiaSpotProductsSource extends CorridorBaseSource {
  readonly descriptor: CorridorSourceDescriptor = {
    id: "eia-spot-products",
    name: "U.S. Energy Information Administration — daily product/crude spot prices (crack)",
    confidence: "official",
    corridors: ["usgulf"],
    expectedCadenceMs: 86_400_000, // spot prices publish on business days
    rateLimit: {
      // Same EIA account/key as eia.ts / eiaCorridor.ts / eiaInventory.ts.
      maxPerHour: 500,
      minIntervalMs: 60_000,
    },
  };

  constructor(private readonly apiKey = process.env.EIA_API_KEY ?? "") {
    super();
  }

  async fetchLatest(): Promise<CorridorMetricRecord[]> {
    const records: CorridorMetricRecord[] = [];
    // Sequential is fine: three daily-cadence calls, no rate pressure.
    for (const cfg of SPOT_PRODUCT_SERIES) {
      const rows = await this.request(cfg);
      for (const row of rows) {
        const rec = this.rowToRecord(cfg, row);
        if (rec) records.push(rec);
      }
      // A series returning zero usable rows is not an error.
    }
    return records;
  }

  /* ── provider-specific plumbing (mirrors eiaInventory.ts) ────── */

  private buildUrl(cfg: EiaSpotSeriesConfig): string {
    if (!this.apiKey) this.fail("auth", "EIA_API_KEY is not set");
    const start = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const p = new URLSearchParams();
    p.set("api_key", this.apiKey);
    p.set("frequency", "daily");
    p.append("data[]", "value");
    p.append("facets[series][]", cfg.seriesId);
    p.set("sort[0][column]", "period");
    p.set("sort[0][direction]", "desc");
    p.set("length", String(MAX_ROWS));
    p.set("start", start);
    return `${BASE_URL}${ROUTE}/data/?${p.toString()}`;
  }

  private async request(cfg: EiaSpotSeriesConfig): Promise<EiaSpotRow[]> {
    const url = this.buildUrl(cfg);
    const body = await this.getJson<EiaSpotResponse>(url, {
      classifyHttpError: (status, text) => this.classify403(status, text),
    });

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

  private rowToRecord(cfg: EiaSpotSeriesConfig, row: EiaSpotRow): CorridorMetricRecord | null {
    // Catalog routes echo the series id per row — defensively skip any
    // row that isn't the series we asked for.
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
      observedAt: `${row.period}T00:00:00.000Z`,
      source: this.descriptor.id,
      confidence: this.descriptor.confidence,
      fetchedAt: new Date().toISOString(),
      raw: { value: rawNumber, unit: row.units || cfg.rawUnitFallback },
      meta: { seriesId: cfg.seriesId, endpoint: ROUTE },
    };
  }
}
