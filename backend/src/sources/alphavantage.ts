/* ────────────────────────────────────────────────────────────────
   Alpha Vantage adapter — reserve-role aggregator for stale-backbone
   fallback (RULES.md §2.4: poll only when backbone is stale/dead).

   Alpha Vantage Commodity API (https://www.alphavantage.co/documentation/#oil-prices):
     GET https://www.alphavantage.co/query?function=WTI|BRENT&interval=daily&apikey=…
     → {
         "name": "Crude Oil Prices: West Texas Intermediate (WTI)",
         "interval": "daily",
         "unit": "dollars per barrel",
         "data": [ { "date": "2024-01-15", "value": "78.50" }, ... ]
       }

   Quirks handled below:
   - `value` can be the literal string "." for missing days (same convention
     as FRED) — skip, not an error.
   - Rate-limit response: HTTP 200 but with "Information" or "Note" keys
     mentioning "rate limit"/"frequency"/"per day" in the body. Classify
     as rate_limited even though status is 200.
   - Missing/invalid API key: { "Error Message": "..." } — classify as auth
     if it mentions "API key", else bad_payload.
   - This is a settlement/daily series like EIA and FRED — same periodDate/
     marketCloseUtc handling via toRecord().
   - Rate limit: 5 req/min is the binding constraint (12s/call minimum),
     but also capped at 25 req/day. Documented in code comment since
     RateLimitPolicy may not have a per-day field.
   - publicationLagBusinessDays: 1 (same T+1 publishing as FRED, sourced
     from NYMEX settlement feeds).
   - Units already $/barrel; route through toRecord()/toUsdPerBarrel.
──────────────────────────────────────────────────────────────── */

import { Benchmark, PriceRecord, SourceDescriptor, SourceErrorKind } from "../core/types";
import { BaseSource } from "./OilPriceSource";

const BASE_URL = "https://www.alphavantage.co/query";

/** Alpha Vantage function per benchmark. */
const FUNCTIONS: Record<Benchmark, string> = {
  WTI: "WTI",
  BRENT: "BRENT",
};

interface AlphaVantageRow {
  date: string; // "YYYY-MM-DD"
  value: string; // "78.50" or "." (literal dot for missing)
}

interface AlphaVantageResponse {
  name?: string;
  interval?: string;
  unit?: string;
  data?: AlphaVantageRow[];
  // Rate limit / error responses arrive in 200 with these keys:
  Information?: string; // "Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute..."
  Note?: string;        // "Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute..."
  "Error Message"?: string; // "the parameter apikey is invalid"
}

export class AlphaVantageSource extends BaseSource {
  readonly descriptor: SourceDescriptor = {
    id: "alphavantage",
    name: "Alpha Vantage (commodity feeds)",
    priority: 4, // reserve role: only when backbone is stale
    confidence: "aggregator",
    role: "reserve",
    benchmarks: ["WTI", "BRENT"],
    kind: "settlement",
    expectedCadenceMs: 24 * 60 * 60 * 1000, // new period each business day
    publicationLagBusinessDays: 1, // NYMEX settlement data, similar to FRED (T+1)
    rateLimit: {
      // Free tier: 5 req/min AND 25 req/day (both enforced by RateLimitPolicy).
      maxPerMinute: 5,
      maxPerDay: 25,
      minIntervalMs: 12_000, // conservative: 60_000 / 5 calls
    },
  };

  constructor(private readonly apiKey = process.env.ALPHAVANTAGE_API_KEY ?? "") {
    super();
  }

  async fetchLatest(benchmarks: Benchmark[]): Promise<PriceRecord[]> {
    const supported = benchmarks.filter((b) => b in FUNCTIONS);
    if (supported.length === 0) return [];

    // Fetch all supported benchmarks in parallel.
    const results = await Promise.all(
      supported.map((benchmark) => this.fetchOne(benchmark))
    );

    return results.flat().filter((r) => r !== null) as PriceRecord[];
  }

  async fetchRange(
    benchmark: Benchmark,
    fromDate: string,
    toDate: string,
  ): Promise<PriceRecord[]> {
    const func = FUNCTIONS[benchmark];
    if (!func) return [];

    // Alpha Vantage's commodity endpoints do not support date range
    // filtering; they always return the full historical series.
    // Fetch all and filter locally.
    const rows = await this.request(func);

    const records: PriceRecord[] = [];
    for (const row of rows) {
      // Filter by date range.
      if (row.date < fromDate || row.date > toDate) continue;
      const record = this.rowToRecord(benchmark, row, "historical");
      if (record) records.push(record);
    }
    return records;
  }

  /* ── provider-specific plumbing ─────────────────────────────── */

  private buildUrl(func: string): string {
    if (!this.apiKey) this.fail("auth", "ALPHAVANTAGE_API_KEY is not set");
    const p = new URLSearchParams();
    p.set("function", func);
    p.set("interval", "daily");
    p.set("apikey", this.apiKey);
    return `${BASE_URL}?${p.toString()}`;
  }

  private async request(func: string): Promise<AlphaVantageRow[]> {
    const url = this.buildUrl(func);
    const body = await this.getJson<AlphaVantageResponse>(url, {
      classifyHttpError: (status, text) => this.classifyAlphaVantageError(status, text),
    });

    // Check for rate-limit responses (HTTP 200 but with Information/Note keys).
    if (body.Information || body.Note) {
      const msg = body.Information || body.Note || "";
      if (/(rate.?limit|frequency|per.?day|per.?minute)/.test(msg.toLowerCase())) {
        this.fail("rate_limited", `Alpha Vantage rate limit: ${msg.slice(0, 200)}`);
      }
    }

    // Check for explicit errors (Error Message key).
    if (body["Error Message"]) {
      const errorMsg = body["Error Message"];
      const kind = errorMsg.toLowerCase().includes("apikey") ? "auth" : "bad_payload";
      this.fail(kind, `Alpha Vantage error: ${errorMsg}`);
    }

    // Validate response shape.
    if (!Array.isArray(body.data)) {
      this.fail(
        "bad_payload",
        `unexpected Alpha Vantage response shape: ${JSON.stringify(body).slice(0, 200)}`
      );
    }

    return body.data;
  }

  /**
   * Classify HTTP errors from Alpha Vantage.
   */
  private classifyAlphaVantageError(status: number, text: string): SourceErrorKind | undefined {
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "rate_limited";
    if (status >= 500) return "upstream_error";
    // Most 4xx errors (e.g., 400) are bad_payload — invalid function, etc.
    return undefined; // let default mapping apply
  }

  /**
   * Convert one Alpha Vantage row into a PriceRecord.
   * "." (literal dot) means missing data; skip it like FRED.
   */
  private rowToRecord(
    benchmark: Benchmark,
    row: AlphaVantageRow,
    kind: "settlement" | "historical",
  ): PriceRecord | null {
    // Alpha Vantage uses "." to represent missing values (holidays, etc.)
    if (row.value === "." || !row.value || row.value.trim() === "") return null;

    const price = Number(row.value);
    if (Number.isNaN(price)) {
      this.fail("bad_payload", `Alpha Vantage value "${row.value}" is not a valid number`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      this.fail("bad_payload", `Alpha Vantage date "${row.date}" is not in YYYY-MM-DD format`);
    }

    return this.toRecord({
      benchmark,
      kind,
      periodDate: row.date,
      raw: { price, unit: "$/BBL" }, // $/BBL → USD/bbl via core/units
      meta: {
        function: FUNCTIONS[benchmark],
        endpoint: "query (commodity)",
      },
    });
  }

  private async fetchOne(benchmark: Benchmark): Promise<PriceRecord | null> {
    const func = FUNCTIONS[benchmark];
    if (!func) return null;

    const rows = await this.request(func);

    // Find the newest (first after sorting — Alpha Vantage returns newest first)
    // valid row for this benchmark.
    for (const row of rows) {
      const record = this.rowToRecord(benchmark, row, "settlement");
      if (record) return record;
    }
    return null;
  }
}
