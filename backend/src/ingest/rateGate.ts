/* ────────────────────────────────────────────────────────────────
   Rate gate + circuit breaker. DB-backed (source_health) because
   ingestion runs as serverless cron — invocations share no memory.
   Full rules: docs/RULES.md §2.
──────────────────────────────────────────────────────────────── */

import { SourceDescriptor, SourceError } from "../core/types";
import { Queryable } from "../storage/db";
import {
  getSourceHealth,
  recordSourceFailure,
  recordSourceSuccess,
  SourceHealthRow,
} from "../storage/priceRepo";

/** Circuit breaker: trip after N consecutive failures. */
export const BREAKER_THRESHOLD = 3;
/** First cooldown 30 min, doubling per further failure, capped at 6 h. */
export const BREAKER_BASE_MS = 30 * 60 * 1000;
export const BREAKER_CAP_MS = 6 * 60 * 60 * 1000;

/** Default cooldown for rate_limited errors without a Retry-After. */
export const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000;

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: "disabled" | "cooldown" | "rate_gate"; until: string | null };

/** May we call this source right now? */
export async function checkGate(
  db: Queryable,
  descriptor: SourceDescriptor,
): Promise<GateDecision> {
  const h = await getSourceHealth(db, descriptor.id);
  const now = Date.now();

  if (h.disabled) return { allowed: false, reason: "disabled", until: null };
  if (h.cooldownUntil && Date.parse(h.cooldownUntil) > now) {
    return { allowed: false, reason: "cooldown", until: h.cooldownUntil };
  }
  if (h.nextAllowedAt && Date.parse(h.nextAllowedAt) > now) {
    return { allowed: false, reason: "rate_gate", until: h.nextAllowedAt };
  }
  return { allowed: true };
}

/**
 * The self-imposed spacing between calls: the strictest of the
 * provider's advertised caps and our own minIntervalMs floor.
 */
export function minSpacingMs(d: SourceDescriptor): number {
  const { maxPerMinute, maxPerHour, maxPerDay, minIntervalMs } = d.rateLimit;
  const candidates = [minIntervalMs];
  if (maxPerMinute) candidates.push(Math.ceil(60_000 / maxPerMinute));
  if (maxPerHour) candidates.push(Math.ceil(3_600_000 / maxPerHour));
  if (maxPerDay) candidates.push(Math.ceil(86_400_000 / maxPerDay));
  return Math.max(...candidates);
}

export async function noteSuccess(db: Queryable, d: SourceDescriptor): Promise<void> {
  await recordSourceSuccess(db, d.id, new Date(Date.now() + minSpacingMs(d)));
}

/**
 * Map a failure onto health-state changes (RULES.md §2.2):
 *  - rate_limited → cooldown until Retry-After (or fallback window); NOT a failure
 *  - auth         → disable source; a human must fix the key
 *  - no_data      → nothing wrong; treated as success with empty result upstream
 *  - network/upstream_error/bad_payload → counts toward the breaker
 */
export async function noteFailure(
  db: Queryable,
  d: SourceDescriptor,
  err: SourceError,
  currentHealth?: SourceHealthRow,
): Promise<void> {
  if (err.kind === "no_data") return;

  if (err.kind === "rate_limited") {
    const until = new Date(Date.now() + (err.retryAfterMs ?? RATE_LIMIT_FALLBACK_MS));
    await recordSourceFailure(db, d.id, err.kind, err.message, {
      cooldownUntil: until,
      countsAsFailure: false,
    });
    return;
  }

  if (err.kind === "auth") {
    // Permanent disable only for a truly bad key — not for "env not set"
    // (common on a misconfigured deploy). Missing-key messages should be
    // fixed by setting the secret, not by latching the breaker forever.
    const missingKey = /is not set|missing|not configured/i.test(err.message);
    await recordSourceFailure(db, d.id, err.kind, err.message, {
      disable: !missingKey,
      countsAsFailure: true,
    });
    return;
  }

  // network / upstream_error / bad_payload → exponential breaker
  const prior = currentHealth ?? (await getSourceHealth(db, d.id));
  const failures = prior.consecutiveFailures + 1;
  let cooldownUntil: Date | undefined;
  if (failures >= BREAKER_THRESHOLD) {
    const exp = Math.min(
      BREAKER_BASE_MS * 2 ** (failures - BREAKER_THRESHOLD),
      BREAKER_CAP_MS,
    );
    cooldownUntil = new Date(Date.now() + exp);
  }
  await recordSourceFailure(db, d.id, err.kind, err.message, {
    cooldownUntil,
    countsAsFailure: true,
  });
}

/**
 * In-process retry policy for a single fetch attempt (RULES.md §2.1):
 * one retry, only for transient kinds, with jitter.
 */
export async function withRetry<T>(fn: () => Promise<T>, sourceId: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const retriable =
      e instanceof SourceError && (e.kind === "network" || e.kind === "upstream_error");
    if (!retriable) throw e;
    await sleep(1_000 + Math.random() * 2_000);
    return fn();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
