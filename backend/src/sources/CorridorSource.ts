/* ────────────────────────────────────────────────────────────────
   The corridor adapter contract — sibling to OilPriceSource.ts for
   the corridor-metrics domain (crude exports, refinery utilization,
   transit density, …) rather than benchmark prices. Same shape:
   descriptor → static facts, fetchLatest → build URL(s) → getJson →
   map rows → CorridorMetricRecord[].

   v1 SCOPE NOTE: this deliberately skips the DB rate-gate (checkGate/
   noteSuccess/noteFailure in ingest/rateGate.ts) that price sources
   go through. Every known corridor source in v1 (EIA WPSR) publishes
   weekly and the cron polls daily — there is nothing to gate against.
   Promoting corridor sources to gated/circuit-broken polling (the
   same source_health machinery price sources use) is future work,
   needed once a higher-cadence corridor source (e.g. a commercial
   AIS feed) shows up.
──────────────────────────────────────────────────────────────── */

import { Confidence, RateLimitPolicy, SourceError, SourceErrorKind } from "../core/types";
import { CorridorId, CorridorMetricRecord } from "../core/corridorTypes";
import { getJsonForSource, GetJsonOptions } from "./http";

export interface CorridorSourceDescriptor {
  id: string;
  name: string;
  confidence: Confidence;
  corridors: CorridorId[];
  expectedCadenceMs: number; // weekly sources: 7 * 86_400_000
  rateLimit: RateLimitPolicy; // reuse from core/types
}

export interface CorridorSource {
  readonly descriptor: CorridorSourceDescriptor;

  /**
   * Fetch the most recent periods (a small trailing window) for every
   * metric this source provides. Throws SourceError on failure.
   */
  fetchLatest(): Promise<CorridorMetricRecord[]>;
}

/* ── shared plumbing every corridor adapter inherits ──────────── */

export abstract class CorridorBaseSource implements CorridorSource {
  abstract readonly descriptor: CorridorSourceDescriptor;

  abstract fetchLatest(): Promise<CorridorMetricRecord[]>;

  /** Fail with a typed error attributed to this source. */
  protected fail(
    kind: SourceErrorKind,
    message: string,
    opts: { retryAfterMs?: number; status?: number; cause?: unknown } = {},
  ): never {
    throw new SourceError(this.descriptor.id, kind, message, opts);
  }

  /** HTTP GET → parsed JSON. Delegates to getJsonForSource (sources/http.ts). */
  protected getJson<T = unknown>(url: string, opts: GetJsonOptions = {}): Promise<T> {
    return getJsonForSource<T>(this.descriptor.id, url, opts);
  }
}
