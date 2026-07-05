/* ────────────────────────────────────────────────────────────────
   EIA corridor adapter — US Gulf weekly petroleum data (WPSR).
   Sibling to sources/eia.ts (the price-domain reference adapter),
   but for the corridor-metrics domain. Same provider, same account,
   different series.

   Uses the v2 CATALOG routes (same pattern as eia.ts), one route per
   series family. NOTE: the v2 "seriesid" compatibility endpoint was
   tried first and rejects these WPSR weekly ids with
   404 "Series ID 'WCREXUS2' is not valid" (live-verified 2026-07-05)
   — do not "simplify" back to it. The catalog routes are
   live-verified:
     GET https://api.eia.gov/v2/{route}/data/
       ?api_key=…
       &frequency=weekly
       &data[]=value
       &facets[series][]={SERIES}
       &sort[0][column]=period&sort[0][direction]=desc
       &length=10
       &start=YYYY-MM-DD          (bounds payload size; ~45 days back)
     → { response: { data: [ { period, series, value, units, … } ] } }
   Routes: WCREXUS2 → petroleum/move/wkly;
           W_NA_YUP_R30_PER → petroleum/pnp/wiup.

   Series → metric mapping:
   - WCREXUS2 ("U.S. Exports of Crude Oil", weekly, MBBL/D)
       → metric "crude_exports", canonical unit "Mb/d" (÷1000, see
         mbblPerDayToMbPerDay() below).
   - W_NA_YUP_R30_PER ("Percent Utilization of Refinery Operable
     Capacity, PADD 3", weekly, percent)
       → metric "refinery_utilization", canonical unit "%" (unchanged).

   Quirks handled below (copied from eia.ts — same provider, same
   behavior, kept local because they are provider logic):
   - `value` arrives as number OR string OR null (null = holiday/gap
     row — skip, not an error).
   - 403 means BOTH "invalid key" and "throttled/suspended key"; the
     body text tells them apart.
   - Some error payloads come back as 200 { error: "…" }.
   - Weekly series stamp the week-ENDING date as `period`
     ("YYYY-MM-DD"); validated with the same regex eia.ts uses for
     daily periods (both are plain calendar dates).

   observedAt convention: WPSR has a fixed weekly publication rhythm,
   but modeling its exact release-time-of-day is out of scope for v1
   (unlike price benchmarks, which route through core/time's
   marketCloseUtc — that's settlement-instant machinery for a
   different domain). We stamp observedAt as the period's UTC
   midnight and let periodDate carry the actual meaning.
──────────────────────────────────────────────────────────────── */

import { SourceErrorKind } from "../core/types";
import { CorridorMetricRecord } from "../core/corridorTypes";
import { CorridorBaseSource, CorridorSourceDescriptor } from "./CorridorSource";

const BASE_URL = "https://api.eia.gov/v2/";
const LOOKBACK_DAYS = 45; // bound payload size; weekly series ⇒ ~6 rows
const MAX_ROWS = 10; // ≥ LOOKBACK_DAYS/7, with slack for revisions

/** WCREXUS2 is thousand barrels/day; canonical corridor unit is Mb/d (millions). */
export function mbblPerDayToMbPerDay(thousandBblPerDay: number): number {
  return thousandBblPerDay / 1000;
}

interface EiaCorridorSeriesConfig {
  seriesId: string;
  /** v2 catalog route the series lives under (see header note). */
  route: string;
  metric: string;
  rawUnitFallback: string;
  toCanonical: (raw: number) => number;
  canonicalUnit: string;
}

const SERIES_CONFIG: EiaCorridorSeriesConfig[] = [
  {
    seriesId: "WCREXUS2",
    route: "petroleum/move/wkly",
    metric: "crude_exports",
    rawUnitFallback: "MBBL/D",
    toCanonical: mbblPerDayToMbPerDay,
    canonicalUnit: "Mb/d",
  },
  {
    seriesId: "W_NA_YUP_R30_PER",
    route: "petroleum/pnp/wiup",
    metric: "refinery_utilization",
    rawUnitFallback: "%",
    toCanonical: (raw) => raw,
    canonicalUnit: "%",
  },
];

interface EiaCorridorRow {
  period: string; // "YYYY-MM-DD" — weekly series stamp the week-ending date
  series?: string; // catalog routes echo the series id per row
  value: number | string | null;
  units?: string;
}

interface EiaCorridorResponse {
  response?: { data: EiaCorridorRow[] };
  error?: string; // sometimes 200 + error body
  data?: { error?: string };
}

export class EiaUsGulfSource extends CorridorBaseSource {
  readonly descriptor: CorridorSourceDescriptor = {
    id: "eia-usgulf",
    name: "U.S. Energy Information Administration — US Gulf weekly (WPSR)",
    confidence: "official",
    corridors: ["usgulf"],
    expectedCadenceMs: 7 * 86_400_000, // WPSR publishes weekly
    rateLimit: {
      // Same EIA account/key as sources/eia.ts — stay far below any
      // plausible ceiling (provider doesn't publish exact numbers).
      maxPerHour: 500,
      minIntervalMs: 60_000,
    },
  };

  constructor(private readonly apiKey = process.env.EIA_API_KEY ?? "") {
    super();
  }

  async fetchLatest(): Promise<CorridorMetricRecord[]> {
    const records: CorridorMetricRecord[] = [];
    // Sequential is fine: two calls, weekly cadence, no rate pressure.
    for (const cfg of SERIES_CONFIG) {
      const rows = await this.request(cfg);
      for (const row of rows) {
        const rec = this.rowToRecord(cfg, row);
        if (rec) records.push(rec);
      }
      // A series returning zero usable rows is not an error.
    }
    return records;
  }

  /* ── provider-specific plumbing (mirrors eia.ts) ────────────── */

  private buildUrl(cfg: EiaCorridorSeriesConfig): string {
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

  private async request(cfg: EiaCorridorSeriesConfig): Promise<EiaCorridorRow[]> {
    const url = this.buildUrl(cfg);
    const body = await this.getJson<EiaCorridorResponse>(url, {
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
    cfg: EiaCorridorSeriesConfig,
    row: EiaCorridorRow,
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
      // WPSR publication timing is not modeled in v1 (see header note).
      observedAt: `${row.period}T00:00:00.000Z`,
      source: this.descriptor.id,
      confidence: this.descriptor.confidence,
      fetchedAt: new Date().toISOString(),
      raw: { value: rawNumber, unit: row.units || cfg.rawUnitFallback },
      meta: { seriesId: cfg.seriesId, endpoint: cfg.route },
    };
  }
}
