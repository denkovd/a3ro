/* ────────────────────────────────────────────────────────────────
   Oil Tracker backend — canonical domain types
   Everything that crosses a module boundary is defined here.
   Adapters normalize INTO these shapes; nothing downstream ever
   sees a source's native payload.
──────────────────────────────────────────────────────────────── */

/** Benchmarks we track. Extend the array + union together. */
export const BENCHMARKS = ["WTI", "BRENT"] as const;
export type Benchmark = (typeof BENCHMARKS)[number];

export function isBenchmark(x: string): x is Benchmark {
  return (BENCHMARKS as readonly string[]).includes(x);
}

/**
 * What kind of price this is. Never compare across kinds without
 * knowing what you're doing (see docs/RULES.md §3).
 *
 * - live:       intraday quote, near-real-time (e.g. CL=F futures)
 * - delayed:    intraday quote with a known delay
 * - settlement: official end-of-trading-day price for a market day
 * - historical: backfill of settlement data (bulk range loads)
 */
export type PriceKind = "live" | "delayed" | "settlement" | "historical";

/** How trustworthy a source is, independent of freshness. */
export type Confidence = "official" | "exchange" | "aggregator" | "unofficial";

/**
 * How a source is used by the poller (see docs/RULES.md §2):
 * - backbone:   polled every cycle; canonical data
 * - supplement: polled every cycle; used for cross-checks + extra kinds
 * - reserve:    quota-precious; only polled when backbone data is stale/dead
 */
export type SourceRole = "backbone" | "supplement" | "reserve";

/** Canonical unit + currency. All stored prices are USD per barrel. */
export const CANONICAL_UNIT = "USD/bbl" as const;
export const CANONICAL_CURRENCY = "USD" as const;

/**
 * The canonical price record. This is the ONLY shape adapters emit
 * and the only shape storage/resolution/alerting consume.
 */
export interface PriceRecord {
  benchmark: Benchmark;
  /** Normalized price in USD per barrel. May legitimately be negative
   *  (WTI settled at −$37.63 on 2020-04-20). */
  price: number;
  unit: typeof CANONICAL_UNIT;
  currency: typeof CANONICAL_CURRENCY;
  /** Instant the price was true in the market, ISO-8601 UTC.
   *  For settlement records this is the market-close instant of periodDate. */
  observedAt: string;
  /** Market day (YYYY-MM-DD) for settlement/historical records. */
  periodDate?: string;
  kind: PriceKind;
  /** Source id (matches SourceDescriptor.id / sources.id in the DB). */
  source: string;
  /** Copied from the source descriptor so records are self-contained. */
  confidence: Confidence;
  /** Instant we retrieved it, ISO-8601 UTC. */
  fetchedAt: string;
  /** Pre-normalization values, kept for audit. */
  raw: { price: number; unit: string; currency: string };
  /** Source-specific breadcrumbs (series id, endpoint, etc). */
  meta?: Record<string, string>;
}

/** Staleness classification — computed, never stored on the observation.
 *  Thresholds are relative to the source's expected cadence (core/time.ts). */
export type Staleness = "fresh" | "aging" | "stale" | "dead";

/* ── Source error taxonomy ──────────────────────────────────────
   The error KIND drives the fallback strategy (docs/RULES.md §2),
   so adapters must map failures onto these categories. */

export type SourceErrorKind =
  | "auth"           // bad/expired/suspended key → disable source, needs a human
  | "rate_limited"   // throttled → cooldown, NOT a failure
  | "upstream_error" // 5xx / source-reported internal error → retry, then circuit-break
  | "network"        // DNS/timeout/conn reset → retry, then circuit-break
  | "bad_payload"    // 200 but unparseable/shape drift → circuit-break + flag (schema drift)
  | "no_data";       // valid response, nothing new (weekend/holiday) → not a failure

export class SourceError extends Error {
  readonly kind: SourceErrorKind;
  /** For rate_limited: when we may try again (from Retry-After or window math). */
  readonly retryAfterMs?: number;
  readonly status?: number;
  readonly sourceId: string;

  constructor(
    sourceId: string,
    kind: SourceErrorKind,
    message: string,
    opts: { retryAfterMs?: number; status?: number; cause?: unknown } = {},
  ) {
    super(`[${sourceId}] ${kind}: ${message}`, { cause: opts.cause });
    this.name = "SourceError";
    this.sourceId = sourceId;
    this.kind = kind;
    this.retryAfterMs = opts.retryAfterMs;
    this.status = opts.status;
  }
}

/* ── Source descriptor ────────────────────────────────────────── */

export interface RateLimitPolicy {
  /** Hard caps advertised by the provider. Enforce the strictest. */
  maxPerMinute?: number;
  maxPerHour?: number;
  maxPerDay?: number;
  /** Self-imposed floor between calls (ms). Every source must set one. */
  minIntervalMs: number;
}

export interface SourceDescriptor {
  id: string;
  name: string;
  /** 1 = most trusted. Resolution prefers lower numbers (RULES.md §3). */
  priority: number;
  confidence: Confidence;
  role: SourceRole;
  benchmarks: Benchmark[];
  /** The kind of records fetchLatest() produces. */
  kind: PriceKind;
  /** How often NEW data appears at the source (ms). Daily series: 24h. */
  expectedCadenceMs: number;
  /** Publication delay: how far behind "now" the newest period is allowed
   *  to be before we call the source stale, in BUSINESS days for
   *  settlement sources (EIA publishes T+1…T+4). 0 for live sources. */
  publicationLagBusinessDays: number;
  rateLimit: RateLimitPolicy;
}

/* ── Resolution outputs (what the API/frontend reads) ───────────── */

/** One row per benchmark: the freshest usable quote (header/ticker feed). */
export interface LatestQuote {
  benchmark: Benchmark;
  price: number;
  kind: PriceKind;
  source: string;
  observedAt: string;
  staleness: Staleness;
  /** Sanity flag: live quote deviates implausibly from last settlement. */
  suspect: boolean;
  updatedAt: string;
}

/** Canonical daily series row (chart feed). */
export interface DailyPrice {
  benchmark: Benchmark;
  periodDate: string; // YYYY-MM-DD
  price: number;
  source: string;
  /** True when comparable sources disagreed beyond tolerance (RULES.md §3). */
  disagreement: boolean;
  /** Max relative spread among comparable values, e.g. 0.004 = 0.4%. */
  spreadPct: number | null;
  updatedAt: string;
}
