/* ────────────────────────────────────────────────────────────────
   Yahoo Finance adapter — unofficial futures scraper for live ticks.
   This is a scraped endpoint (no authentication, no published SLA).

   Quirks:
   - API endpoint: GET https://query1.finance.yahoo.com/v8/finance/chart/{ticker}
     No auth required. Accepts optional ?interval=1d&range=5d for range queries.
   - Response can have chart.error non-null even with HTTP 200 — treat as
     bad_payload unless error text indicates rate-limiting.
   - chart.result can be empty or missing, or timestamp/close arrays can be
     misaligned/contain nulls → all bad_payload.
   - Prefer meta.regularMarketPrice + meta.regularMarketTime for "latest"
     (simpler, more reliable) over parsing parallel arrays.
   - This is live-kind data (intraday), not settlement. Use observedAt from
     regularMarketTime (epoch seconds, convert to ms → ISO), not periodDate.
   - Rate limits: no official limits published; self-imposed 60 req/hour +
     2000 ms minimum between calls (conservative guess).
   - Sometimes returns 200 with bad or incomplete data without warning —
     expect bad_payload errors to be routine.
──────────────────────────────────────────────────────────────── */

import { Benchmark, PriceRecord, SourceDescriptor, SourceErrorKind } from "../core/types";
import { BaseSource } from "./OilPriceSource";

const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

/** Yahoo Finance tickers per benchmark. */
const TICKERS: Record<Benchmark, string> = {
  WTI: "CL=F",  // WTI crude oil front-month futures
  BRENT: "BZ=F", // Brent crude oil front-month futures
};
const TICKER_TO_BENCHMARK: Record<string, Benchmark> = { "CL=F": "WTI", "BZ=F": "BRENT" };

interface YahooChartMeta {
  regularMarketPrice: number;
  regularMarketTime: number; // epoch seconds
  currency: string;
  [key: string]: unknown;
}

interface YahooChartIndicators {
  quote: Array<{
    close?: (number | null)[];
    [key: string]: unknown;
  }>;
}

interface YahooChartResult {
  meta: YahooChartMeta;
  timestamp?: (number | null)[];
  indicators?: YahooChartIndicators;
}

interface YahooChartError {
  code: string;
  description: string;
}

interface YahooResponse {
  chart?: {
    result?: YahooChartResult[];
    error?: YahooChartError | null;
  };
}

export class YFinanceSource extends BaseSource {
  readonly descriptor: SourceDescriptor = {
    id: "yfinance",
    name: "Yahoo Finance (unofficial futures)",
    priority: 3, // supplement after official sources
    confidence: "unofficial",
    role: "supplement",
    benchmarks: ["WTI", "BRENT"],
    kind: "live", // intraday futures, not settlement
    expectedCadenceMs: 60 * 1000, // expect updates ~1 per minute during market hours
    publicationLagBusinessDays: 0, // live data, no publication lag
    rateLimit: {
      // Yahoo doesn't publish official limits; this is a conservative guess
      // based on the unofficial nature and to avoid being rate-limited/blocked.
      maxPerHour: 60,
      minIntervalMs: 2000, // 2 sec min between calls
    },
  };

  async fetchLatest(benchmarks: Benchmark[]): Promise<PriceRecord[]> {
    const supported = benchmarks.filter((b) => b in TICKERS);
    if (supported.length === 0) return [];

    // Fetch all requested benchmarks in parallel.
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
    const ticker = TICKERS[benchmark];
    if (!ticker) return [];

    // Yahoo's range API: ?interval=1d&range=5d gives daily bars, but range
    // is relative to today, not absolute dates. For a true range, we'd need
    // to compute range param dynamically. For now, keep it simple: return
    // empty or fetch a short window. A fuller implementation would map
    // (fromDate, toDate) to a range parameter or hit multiple pages.
    // For MVP, yfinance is live-focused (fetchLatest); backfill via EIA/FRED.
    return [];
  }

  /* ── provider-specific plumbing ─────────────────────────────── */

  private async fetchOne(benchmark: Benchmark): Promise<PriceRecord | null> {
    const ticker = TICKERS[benchmark];
    if (!ticker) return null;

    const url = `${BASE_URL}/${ticker}`;
    const body = await this.getJson<YahooResponse>(url, {
      classifyHttpError: (status, text) => this.classifyYahooError(status, text),
    });

    // Chart-level error (can be non-null even with HTTP 200).
    if (body.chart?.error) {
      const err = body.chart.error;
      const description = `${err.code}: ${err.description}`.toLowerCase();
      // If the error description hints at rate-limiting, classify as such.
      if (/(throttl|rate|too many|exceed)/.test(description)) {
        this.fail("rate_limited", `Yahoo error: ${err.code} — ${err.description}`);
      }
      // Otherwise treat as bad_payload (ticker not found, etc.).
      this.fail("bad_payload", `Yahoo error: ${err.code} — ${err.description}`);
    }

    // Validate result shape.
    if (!body.chart?.result || !Array.isArray(body.chart.result) || body.chart.result.length === 0) {
      this.fail("bad_payload", "Yahoo response missing chart.result or empty array");
    }

    const result = body.chart.result[0];
    if (!result.meta) {
      this.fail("bad_payload", "Yahoo response missing chart.result[0].meta");
    }

    // Extract latest price and timestamp from meta (simpler, more reliable).
    const { regularMarketPrice, regularMarketTime } = result.meta;
    if (typeof regularMarketPrice !== "number" || typeof regularMarketTime !== "number") {
      this.fail(
        "bad_payload",
        `Yahoo meta missing/invalid regularMarketPrice or regularMarketTime`
      );
    }

    if (!Number.isFinite(regularMarketPrice) || !Number.isFinite(regularMarketTime)) {
      this.fail("bad_payload", `Yahoo regularMarketPrice or regularMarketTime not finite`);
    }

    // regularMarketTime is epoch seconds; convert to ms for Date constructor.
    const observedAtMs = regularMarketTime * 1000;

    return this.toRecord({
      benchmark,
      raw: { price: regularMarketPrice, unit: "USD/bbl", currency: "USD" },
      kind: "live",
      observedAt: observedAtMs, // toRecord accepts both ISO string and epoch ms
      meta: {
        ticker,
        endpoint: "v8/finance/chart",
      },
    });
  }

  /**
   * Classify HTTP errors from Yahoo. Since this is an unofficial endpoint,
   * we are conservative: most non-2xx is bad_payload, and we specifically
   * check for rate-limiting signals.
   */
  private classifyYahooError(status: number, text: string): SourceErrorKind | undefined {
    if (status === 429) return "rate_limited"; // explicit 429
    if (status >= 500) return "upstream_error";
    if (status === 401 || status === 403) return "auth"; // unlikely but possible
    // Most other errors (4xx) are bad_payload — ticker not found, etc.
    // Inspect body for rate-limit hints.
    const textLower = text.toLowerCase();
    if (/(throttl|rate|too many|exceed)/.test(textLower)) {
      return "rate_limited";
    }
    return "bad_payload";
  }
}
