/* ────────────────────────────────────────────────────────────────
   FRED adapter — Federal Reserve Economic Data oil price series.

   FRED API (https://fred.stlouisfed.org/docs/api/fred/):
     GET https://api.stlouisfed.org/fred/series/observations
       ?series_id=DCOILWTICO|DCOILBRENTEU
       &api_key=…
       &file_type=json
       &sort_order=desc (for latest) or asc (for range)
       &observation_start=YYYY-MM-DD (for range)
       &observation_end=YYYY-MM-DD (for range)
       &limit=N
     → { observations: [ { date: "YYYY-MM-DD", value: "78.5" or "." } ] }

   Quirks handled below:
   - `value` is ALWAYS a string, never a number.
   - "." (literal dot) means no data for that date (holiday/missing); skip it.
   - HTTP 400 (not 401/403!) for auth failures; inspect the JSON body for
     error_code/error_message to distinguish invalid key (auth) from bad
     series_id (bad_payload).
   - Settlement-kind daily series, same periodDate/marketCloseUtc handling
     as EIA. FRED's DCOILWTICO/DCOILBRENTEU typically publish T+1 (next
     business day after the market day), so publicationLagBusinessDays = 1.
   - Units are already $/barrel; no conversion quirks beyond what
     core/units.ts handles.
──────────────────────────────────────────────────────────────── */

import { Benchmark, PriceRecord, SourceDescriptor, SourceErrorKind } from "../core/types";
import { BaseSource } from "./OilPriceSource";

const BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

/** FRED series id per benchmark. */
const SERIES: Record<Benchmark, string> = {
  WTI: "DCOILWTICO",
  BRENT: "DCOILBRENTEU",
};
const SERIES_TO_BENCHMARK: Record<string, Benchmark> = {
  DCOILWTICO: "WTI",
  DCOILBRENTEU: "BRENT",
};

interface FredObservation {
  date: string; // "YYYY-MM-DD"
  value: string; // "78.5" or "." (literal dot for missing)
}

interface FredResponse {
  observations?: FredObservation[];
  error_code?: number;
  error_message?: string;
}

export class FredSource extends BaseSource {
  readonly descriptor: SourceDescriptor = {
    id: "fred",
    name: "Federal Reserve Economic Data (FRED)",
    priority: 2, // official US government series, mirrored from EIA
    confidence: "official",
    role: "backbone",
    benchmarks: ["WTI", "BRENT"],
    kind: "settlement",
    expectedCadenceMs: 24 * 60 * 60 * 1000, // new period each business day
    publicationLagBusinessDays: 1, // FRED's DCOILWTICO/BRENTEU typically publish T+1
    rateLimit: {
      maxPerHour: 7200, // 120 req/min = 7200 req/hour
      minIntervalMs: 500, // conservative self-imposed floor
    },
  };

  constructor(private readonly apiKey = process.env.FRED_API_KEY ?? "") {
    super();
  }

  async fetchLatest(benchmarks: Benchmark[]): Promise<PriceRecord[]> {
    const supported = benchmarks.filter((b) => b in SERIES);
    if (supported.length === 0) return [];

    // Request both series in parallel, sorted descending to get latest first.
    // (Gate on whether the caller actually asked for that benchmark, not on
    // the meaningless "series id string is a key of SERIES" check that was
    // here before -- that always evaluated false and silently skipped every
    // request.)
    const [wtiObservations, brentObservations] = await Promise.all([
      supported.includes("WTI") ? this.requestObservations(SERIES["WTI"]) : Promise.resolve([]),
      supported.includes("BRENT") ? this.requestObservations(SERIES["BRENT"]) : Promise.resolve([]),
    ]);

    const records: PriceRecord[] = [];
    if (supported.includes("WTI")) {
      const record = this.findNewestRecord("WTI", wtiObservations);
      if (record) records.push(record);
    }
    if (supported.includes("BRENT")) {
      const record = this.findNewestRecord("BRENT", brentObservations);
      if (record) records.push(record);
    }
    return records;
  }

  async fetchRange(
    benchmark: Benchmark,
    fromDate: string,
    toDate: string,
  ): Promise<PriceRecord[]> {
    const seriesId = SERIES[benchmark];
    if (!seriesId) return [];

    const observations = await this.requestObservations(seriesId, {
      observation_start: fromDate,
      observation_end: toDate,
      sort_order: "asc", // ascending for range (oldest first)
    });

    const records: PriceRecord[] = [];
    for (const obs of observations) {
      const record = this.observationToRecord(benchmark, obs, "historical");
      if (record) records.push(record);
    }
    return records;
  }

  /* ── provider-specific plumbing ─────────────────────────────── */

  private buildUrl(
    seriesId: string,
    opts?: {
      observation_start?: string;
      observation_end?: string;
      sort_order?: "asc" | "desc";
      limit?: number;
    },
  ): string {
    if (!this.apiKey) this.fail("auth", "FRED_API_KEY is not set");
    const p = new URLSearchParams();
    p.set("series_id", seriesId);
    p.set("api_key", this.apiKey);
    p.set("file_type", "json");
    if (opts?.observation_start) p.set("observation_start", opts.observation_start);
    if (opts?.observation_end) p.set("observation_end", opts.observation_end);
    p.set("sort_order", opts?.sort_order ?? "desc");
    if (opts?.limit) p.set("limit", String(opts.limit));
    return `${BASE_URL}?${p.toString()}`;
  }

  private async requestObservations(
    seriesId: string,
    opts?: {
      observation_start?: string;
      observation_end?: string;
      sort_order?: "asc" | "desc";
      limit?: number;
    },
  ): Promise<FredObservation[]> {
    const url = this.buildUrl(seriesId, opts);
    const body = await this.getJson<FredResponse>(url, {
      classifyHttpError: (status, text) => this.classifyFredError(status, text),
    });

    // FRED returns 400 for auth/bad_payload; error details are in the body
    if (body.error_code !== undefined || body.error_message !== undefined) {
      const errorMsg = `${body.error_message ?? "unknown error"} (code: ${body.error_code})`;
      this.fail(this.classifyFredErrorMessage(body.error_message), `FRED error: ${errorMsg}`);
    }

    if (!Array.isArray(body.observations)) {
      this.fail("bad_payload", `unexpected FRED response shape: ${JSON.stringify(body).slice(0, 200)}`);
    }

    return body.observations;
  }

  /**
   * Classify HTTP errors from FRED. FRED returns 400 for both auth and
   * bad_payload, so we inspect the body to distinguish them.
   */
  private classifyFredError(status: number, text: string): SourceErrorKind | undefined {
    if (status === 400) {
      // 400 could be auth (invalid key) or bad_payload (invalid series).
      // Let the body parsing in requestObservations() decide via classifyFredErrorMessage.
      return undefined;
    }
    if (status === 429) return "rate_limited";
    if (status >= 500) return "upstream_error";
    return undefined; // let default mapping apply
  }

  /**
   * Classify error messages from FRED's error_message field to distinguish
   * auth failures from bad payload.
   */
  private classifyFredErrorMessage(message?: string): SourceErrorKind {
    if (!message) return "bad_payload";
    const msg = message.toLowerCase();
    if (/(invalid|missing|not found|bad_request).*api.?key|api.?key.*(invalid|missing|unauthorized)/.test(msg)) {
      return "auth";
    }
    if (/(invalid|not found|unknown).*series/.test(msg)) {
      return "bad_payload";
    }
    return "bad_payload";
  }

  /**
   * Find the newest (first after sorting desc) valid observation for a benchmark.
   */
  private findNewestRecord(
    benchmark: Benchmark,
    observations: FredObservation[],
  ): PriceRecord | null {
    for (const obs of observations) {
      const record = this.observationToRecord(benchmark, obs, "settlement");
      if (record) return record;
    }
    return null;
  }

  /**
   * Convert one FRED observation into a PriceRecord.
   * "." (literal dot) means missing data; skip it like EIA skips nulls.
   */
  private observationToRecord(
    benchmark: Benchmark,
    obs: FredObservation,
    kind: "settlement" | "historical",
  ): PriceRecord | null {
    // FRED uses "." to represent missing values (holidays, etc.)
    if (obs.value === "." || !obs.value || obs.value.trim() === "") return null;

    const price = Number(obs.value);
    if (Number.isNaN(price)) {
      this.fail("bad_payload", `FRED value "${obs.value}" is not a valid number`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(obs.date)) {
      this.fail("bad_payload", `FRED date "${obs.date}" is not in YYYY-MM-DD format`);
    }

    return this.toRecord({
      benchmark,
      kind,
      periodDate: obs.date,
      raw: { price, unit: "$/BBL" }, // $/BBL → USD/bbl via core/units
      meta: {
        seriesId: SERIES[benchmark],
        endpoint: "fred/series/observations",
      },
    });
  }
}
