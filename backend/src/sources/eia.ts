/* ────────────────────────────────────────────────────────────────
   EIA adapter — THE REFERENCE IMPLEMENTATION.
   Copy this file's structure when writing fred.ts, alphavantage.ts,
   yfinance.ts. The shape to preserve:

     descriptor  → static facts about the source
     fetchLatest → build URL → getJson → parse → toRecord[]
     fetchRange  → same, with pagination
     private parse/classify helpers → all provider quirks live here

   EIA v2 API (https://www.eia.gov/opendata/documentation.php):
     GET https://api.eia.gov/v2/petroleum/pri/spt/data/
       ?api_key=…
       &frequency=daily
       &data[]=value
       &facets[series][]=RWTC          (WTI, Cushing OK spot FOB)
       &facets[series][]=RBRTE         (Brent, Europe spot FOB)
       &sort[0][column]=period&sort[0][direction]=desc
       &length=N&offset=N&start=YYYY-MM-DD&end=YYYY-MM-DD
     → { response: { total, data: [ { period, series, value, units, … } ] } }

   Quirks handled below:
   - `value` arrives as number OR string depending on dataset vintage.
   - 403 means BOTH "invalid key" and "throttled/suspended key";
     the body text tells them apart.
   - Some error payloads come back as 200 { error: "…" }.
   - Daily spot series publish on business days with a T+1…T+4 lag,
     so records are `settlement` kind and staleness is business-day
     based (descriptor.publicationLagBusinessDays).
──────────────────────────────────────────────────────────────── */

import { Benchmark, PriceRecord, SourceDescriptor, SourceErrorKind } from "../core/types";
import { BaseSource } from "./OilPriceSource";

const BASE_URL = "https://api.eia.gov/v2/petroleum/pri/spt/data/";
const MAX_PAGE = 5000; // EIA hard cap per request
const MAX_PAGES = 20; // backfill safety valve (~100k rows)

/** EIA series id per benchmark. */
const SERIES: Record<Benchmark, string> = {
  WTI: "RWTC",
  BRENT: "RBRTE",
};
const SERIES_TO_BENCHMARK: Record<string, Benchmark> = { RWTC: "WTI", RBRTE: "BRENT" };

interface EiaRow {
  period: string; // "YYYY-MM-DD" at frequency=daily
  series: string; // "RWTC" | "RBRTE"
  "series-description"?: string;
  value: number | string | null;
  units: string; // "$/BBL"
}

interface EiaResponse {
  response?: { total: number | string; data: EiaRow[] };
  error?: string; // sometimes 200 + error body
  data?: { error?: string };
}

export class EiaSource extends BaseSource {
  readonly descriptor: SourceDescriptor = {
    id: "eia",
    name: "U.S. Energy Information Administration (open data v2)",
    priority: 1, // official US government series — the backbone
    confidence: "official",
    role: "backbone",
    benchmarks: ["WTI", "BRENT"],
    kind: "settlement",
    expectedCadenceMs: 24 * 60 * 60 * 1000, // new period each business day
    publicationLagBusinessDays: 4, // spot series routinely publish T+1…T+4
    rateLimit: {
      // EIA doesn't publish exact numbers; exceeding them auto-suspends
      // the key temporarily. We stay far below any plausible ceiling.
      maxPerHour: 500,
      minIntervalMs: 60_000,
    },
  };

  constructor(private readonly apiKey = process.env.EIA_API_KEY ?? "") {
    super();
  }

  /**
   * How many calendar days of settlements to keep on each daily poll.
   * Previously we kept only the single newest row per series — any day
   * the cron missed was permanently lost from daily_prices. Returning a
   * short trailing window self-heals gaps (idempotent upserts).
   */
  static readonly LATEST_LOOKBACK_DAYS = 21;

  async fetchLatest(benchmarks: Benchmark[]): Promise<PriceRecord[]> {
    const supported = benchmarks.filter((b) => b in SERIES);
    if (supported.length === 0) return [];

    // ~business-days-in-window × series, with slack for holidays/nulls.
    // Rows arrive period-desc; we keep every finite row in the lookback.
    const length = supported.length * EiaSource.LATEST_LOOKBACK_DAYS * 2;
    const url = this.buildUrl({
      series: supported.map((b) => SERIES[b]),
      length,
    });
    const rows = await this.request(url);

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - EiaSource.LATEST_LOOKBACK_DAYS);
    const cutoffYmd = cutoff.toISOString().slice(0, 10);

    const records: PriceRecord[] = [];
    for (const row of rows) {
      const benchmark = SERIES_TO_BENCHMARK[row.series];
      if (!benchmark || !supported.includes(benchmark)) continue;
      if (row.period < cutoffYmd) continue;
      const rec = this.rowToRecord(benchmark, row, "settlement");
      if (rec) records.push(rec);
    }
    return records;
  }

  async fetchRange(
    benchmark: Benchmark,
    fromDate: string,
    toDate: string,
  ): Promise<PriceRecord[]> {
    const series = SERIES[benchmark];
    if (!series) return [];

    const records: PriceRecord[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = this.buildUrl({
        series: [series],
        start: fromDate,
        end: toDate,
        length: MAX_PAGE,
        offset: page * MAX_PAGE,
        ascending: true,
      });
      const rows = await this.request(url);
      for (const row of rows) {
        const rec = this.rowToRecord(benchmark, row, "historical");
        if (rec) records.push(rec);
      }
      if (rows.length < MAX_PAGE) break; // last page
    }
    return records;
  }

  /* ── provider-specific plumbing ─────────────────────────────── */

  private buildUrl(q: {
    series: string[];
    length: number;
    offset?: number;
    start?: string;
    end?: string;
    ascending?: boolean;
  }): string {
    if (!this.apiKey) this.fail("auth", "EIA_API_KEY is not set");
    const p = new URLSearchParams();
    p.set("api_key", this.apiKey);
    p.set("frequency", "daily");
    p.append("data[]", "value");
    for (const s of q.series) p.append("facets[series][]", s);
    p.set("sort[0][column]", "period");
    p.set("sort[0][direction]", q.ascending ? "asc" : "desc");
    p.set("length", String(q.length));
    if (q.offset) p.set("offset", String(q.offset));
    if (q.start) p.set("start", q.start);
    if (q.end) p.set("end", q.end);
    return `${BASE_URL}?${p.toString()}`;
  }

  private async request(url: string): Promise<EiaRow[]> {
    const body = await this.getJson<EiaResponse>(url, {
      classifyHttpError: (status, text) => this.classify403(status, text),
    });

    // EIA occasionally reports errors inside a 200 body.
    const inlineError = body.error ?? body.data?.error;
    if (inlineError) {
      this.fail(this.textToKind(inlineError), `EIA error body: ${inlineError}`);
    }
    if (!body.response || !Array.isArray(body.response.data)) {
      this.fail("bad_payload", `unexpected EIA response shape: ${JSON.stringify(body).slice(0, 200)}`);
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
    benchmark: Benchmark,
    row: EiaRow,
    kind: "settlement" | "historical",
  ): PriceRecord | null {
    // null values appear for market holidays — skip, not an error.
    if (row.value === null || row.value === undefined || row.value === "") return null;

    const price = typeof row.value === "number" ? row.value : Number(row.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.period)) {
      this.fail("bad_payload", `EIA period "${row.period}" is not a daily date`);
    }

    return this.toRecord({
      benchmark,
      kind,
      periodDate: row.period,
      raw: { price, unit: row.units || "$/BBL" }, // "$/BBL" → USD/bbl via core/units
      meta: {
        seriesId: SERIES[benchmark],
        endpoint: "petroleum/pri/spt",
        description: row["series-description"] ?? "",
      },
    });
  }
}
