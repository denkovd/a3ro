/* ────────────────────────────────────────────────────────────────
   The adapter contract. Every data source — free tier today,
   Bloomberg tomorrow — implements OilPriceSource and nothing else
   changes. Swapping/adding a provider is: write one adapter file,
   register it in sources/registry.ts, insert a row in `sources`.

   HOW TO WRITE AN ADAPTER (the recipe FRED/AlphaVantage/yfinance
   must follow — see sources/eia.ts for the worked reference):

   1. Extend BaseSource. Fill in a SourceDescriptor (id, priority,
      confidence, role, kind, cadence, lag, rate limits).
   2. Implement fetchLatest(): build URL(s) → this.getJson() →
      map rows → this.toRecord() per row → return records.
   3. Implement fetchRange() the same way (used for backfill).
   4. NEVER do unit math or date math inline — toRecord() routes
      through core/units + core/time.
   5. Map provider failures onto SourceError kinds. If you can't
      tell auth from throttling, inspect the response body — the
      kind you pick decides how the pipeline reacts (RULES.md §2).
──────────────────────────────────────────────────────────────── */

import {
  Benchmark,
  Confidence,
  PriceKind,
  PriceRecord,
  SourceDescriptor,
  SourceError,
  SourceErrorKind,
} from "../core/types";
import { NormalizationError, RawPrice, toUsdPerBarrel } from "../core/units";
import { marketCloseUtc, nowIso } from "../core/time";

export interface OilPriceSource {
  readonly descriptor: SourceDescriptor;

  /**
   * Fetch the newest available record for each requested benchmark.
   * Returns 0..n records (a missing benchmark is NOT an error — the
   * resolver falls back to other sources). Throws SourceError on failure.
   */
  fetchLatest(benchmarks: Benchmark[]): Promise<PriceRecord[]>;

  /**
   * Fetch a historical range (inclusive dates, YYYY-MM-DD) for backfill.
   * Throws SourceError on failure.
   */
  fetchRange(benchmark: Benchmark, fromDate: string, toDate: string): Promise<PriceRecord[]>;
}

/* ── shared plumbing every adapter inherits ───────────────────── */

export interface GetJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Called on non-2xx to refine the error kind from the body. */
  classifyHttpError?: (status: number, body: string) => SourceErrorKind | undefined;
}

export abstract class BaseSource implements OilPriceSource {
  abstract readonly descriptor: SourceDescriptor;

  abstract fetchLatest(benchmarks: Benchmark[]): Promise<PriceRecord[]>;
  abstract fetchRange(
    benchmark: Benchmark,
    fromDate: string,
    toDate: string,
  ): Promise<PriceRecord[]>;

  /** Fail with a typed error attributed to this source. */
  protected fail(
    kind: SourceErrorKind,
    message: string,
    opts: { retryAfterMs?: number; status?: number; cause?: unknown } = {},
  ): never {
    throw new SourceError(this.descriptor.id, kind, message, opts);
  }

  /**
   * HTTP GET → parsed JSON, with timeout and the default
   * status→SourceError mapping. Adapters may refine the mapping via
   * classifyHttpError (e.g. EIA returns 403 for BOTH bad keys and
   * throttled keys — the body tells them apart).
   */
  protected async getJson<T = unknown>(url: string, opts: GetJsonOptions = {}): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, { headers: opts.headers, signal: controller.signal });
    } catch (cause) {
      clearTimeout(timer);
      const timedOut = cause instanceof Error && cause.name === "AbortError";
      this.fail("network", timedOut ? `timeout after ${timeoutMs}ms` : String(cause), { cause });
    } finally {
      clearTimeout(timer);
    }

    const body = await res.text();

    if (!res.ok) {
      const refined = opts.classifyHttpError?.(res.status, body);
      const kind: SourceErrorKind =
        refined ??
        (res.status === 401 || res.status === 403 ? "auth"
          : res.status === 429 ? "rate_limited"
          : res.status >= 500 ? "upstream_error"
          : "bad_payload");
      const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
      this.fail(kind, `HTTP ${res.status}: ${body.slice(0, 300)}`, {
        status: res.status,
        retryAfterMs,
      });
    }

    try {
      return JSON.parse(body) as T;
    } catch (cause) {
      this.fail("bad_payload", `response is not JSON: ${body.slice(0, 200)}`, { cause });
    }
  }

  /**
   * Turn one parsed row into a canonical PriceRecord.
   * This is the single funnel: unit/currency normalization, sanity
   * bounds, and timestamp conventions all happen here.
   */
  protected toRecord(input: {
    benchmark: Benchmark;
    raw: RawPrice;
    kind: PriceKind;
    /** Required for settlement/historical rows. */
    periodDate?: string;
    /** Required for live/delayed rows (ISO or epoch-ms). */
    observedAt?: string | number;
    meta?: Record<string, string>;
  }): PriceRecord {
    const { benchmark, raw, kind } = input;

    let observedAt: string;
    let periodDate = input.periodDate;
    if (kind === "settlement" || kind === "historical") {
      if (!periodDate) this.fail("bad_payload", `${kind} row for ${benchmark} lacks periodDate`);
      observedAt = marketCloseUtc(benchmark, periodDate).toISOString();
    } else {
      if (input.observedAt === undefined) {
        this.fail("bad_payload", `${input.kind} row for ${benchmark} lacks observedAt`);
      }
      const d = new Date(input.observedAt);
      if (Number.isNaN(d.getTime())) {
        this.fail("bad_payload", `unparseable observedAt "${input.observedAt}" for ${benchmark}`);
      }
      observedAt = d.toISOString();
      periodDate = undefined;
    }

    let normalized: ReturnType<typeof toUsdPerBarrel>;
    try {
      normalized = toUsdPerBarrel(raw);
    } catch (e) {
      if (e instanceof NormalizationError) this.fail("bad_payload", e.message, { cause: e });
      throw e;
    }

    return {
      benchmark,
      price: normalized.price,
      unit: normalized.unit,
      currency: normalized.currency,
      observedAt,
      periodDate,
      kind,
      source: this.descriptor.id,
      confidence: this.descriptor.confidence,
      fetchedAt: nowIso(),
      raw: { price: raw.price, unit: raw.unit, currency: raw.currency ?? "USD" },
      meta: input.meta,
    };
  }
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}
