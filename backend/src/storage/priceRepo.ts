/* ────────────────────────────────────────────────────────────────
   Repository layer: the only module that writes SQL.
   Ingestion/resolution/alerting call these functions; REST handlers
   (deferred) should read via getLatestQuotes/getDailySeries.
──────────────────────────────────────────────────────────────── */

import {
  Benchmark,
  DailyPrice,
  LatestQuote,
  PriceRecord,
  SourceErrorKind,
} from "../core/types";
import { Queryable } from "./db";

/* ── observations (append-only) ───────────────────────────────── */

/** Insert normalized records; duplicates are silently skipped. Returns rows written. */
export async function insertObservations(db: Queryable, records: PriceRecord[]): Promise<number> {
  let written = 0;
  for (const r of records) {
    const res = await db.query(
      `insert into price_observations
         (source_id, benchmark, kind, price, raw_price, raw_unit, raw_currency,
          observed_at, period_date, fetched_at, meta)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict on constraint uq_observation do nothing`,
      [
        r.source, r.benchmark, r.kind, r.price,
        r.raw.price, r.raw.unit, r.raw.currency,
        r.observedAt, r.periodDate ?? null, r.fetchedAt,
        r.meta ? JSON.stringify(r.meta) : null,
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/** Newest observation per source for a benchmark (input to resolution). */
export async function getNewestObservations(
  db: Queryable,
  benchmark: Benchmark,
): Promise<PriceRecord[]> {
  const res = await db.query(
    `select distinct on (o.source_id, o.kind)
            o.source_id, o.benchmark, o.kind, o.price, o.raw_price, o.raw_unit,
            o.raw_currency, o.observed_at, o.period_date, o.fetched_at, o.meta,
            s.confidence
       from price_observations o
       join sources s on s.id = o.source_id and s.enabled
      where o.benchmark = $1
      order by o.source_id, o.kind, o.observed_at desc`,
    [benchmark],
  );
  return res.rows.map(rowToRecord);
}

/** Settlement-kind observations for one market day across sources. */
export async function getObservationsForPeriod(
  db: Queryable,
  benchmark: Benchmark,
  periodDate: string,
): Promise<PriceRecord[]> {
  const res = await db.query(
    `select o.source_id, o.benchmark, o.kind, o.price, o.raw_price, o.raw_unit,
            o.raw_currency, o.observed_at, o.period_date, o.fetched_at, o.meta,
            s.confidence
       from price_observations o
       join sources s on s.id = o.source_id and s.enabled
      where o.benchmark = $1
        and o.period_date = $2
        and o.kind in ('settlement','historical')`,
    [benchmark, periodDate],
  );
  return res.rows.map(rowToRecord);
}

/**
 * Distinct market days that have settlement/historical observations for
 * a benchmark, optionally bounded to period_date >= fromYmd. Used by the
 * ingest cycle so a multi-day EIA poll re-resolves every day it wrote —
 * not only the single newest (source, kind) row.
 */
export async function getSettlementPeriods(
  db: Queryable,
  benchmark: Benchmark,
  fromYmd?: string,
): Promise<string[]> {
  const res = fromYmd
    ? await db.query(
        `select distinct period_date
           from price_observations
          where benchmark = $1
            and period_date is not null
            and period_date >= $2
            and kind in ('settlement','historical')
          order by period_date asc`,
        [benchmark, fromYmd],
      )
    : await db.query(
        `select distinct period_date
           from price_observations
          where benchmark = $1
            and period_date is not null
            and kind in ('settlement','historical')
          order by period_date asc`,
        [benchmark],
      );
  return res.rows.map((r) => {
    const v = r.period_date;
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, "0");
      const d = String(v.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(v).slice(0, 10);
  });
}

/* ── resolved outputs ─────────────────────────────────────────── */

export async function upsertDailyPrice(db: Queryable, p: DailyPrice): Promise<void> {
  await db.query(
    `insert into daily_prices (benchmark, period_date, price, source_id, disagreement, spread_pct, updated_at)
     values ($1,$2,$3,$4,$5,$6, now())
     on conflict (benchmark, period_date) do update
       set price = excluded.price,
           source_id = excluded.source_id,
           disagreement = excluded.disagreement,
           spread_pct = excluded.spread_pct,
           updated_at = now()`,
    [p.benchmark, p.periodDate, p.price, p.source, p.disagreement, p.spreadPct],
  );
}

export async function upsertLatestQuote(db: Queryable, q: LatestQuote): Promise<void> {
  await db.query(
    `insert into latest_quotes (benchmark, price, kind, source_id, observed_at, staleness, suspect, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7, now())
     on conflict (benchmark) do update
       set price = excluded.price,
           kind = excluded.kind,
           source_id = excluded.source_id,
           observed_at = excluded.observed_at,
           staleness = excluded.staleness,
           suspect = excluded.suspect,
           updated_at = now()`,
    [q.benchmark, q.price, q.kind, q.source, q.observedAt, q.staleness, q.suspect],
  );
}

export async function getLatestQuotes(db: Queryable): Promise<LatestQuote[]> {
  const res = await db.query(`select * from latest_quotes`);
  return res.rows.map((r) => ({
    benchmark: r.benchmark as Benchmark,
    price: Number(r.price),
    kind: r.kind as LatestQuote["kind"],
    source: String(r.source_id),
    observedAt: toIso(r.observed_at),
    staleness: r.staleness as LatestQuote["staleness"],
    suspect: Boolean(r.suspect),
    updatedAt: toIso(r.updated_at),
  }));
}

export async function getDailySeries(
  db: Queryable,
  benchmark: Benchmark,
  fromDate: string,
  toDate: string,
): Promise<DailyPrice[]> {
  const res = await db.query(
    `select * from daily_prices
      where benchmark = $1 and period_date between $2 and $3
      order by period_date asc`,
    [benchmark, fromDate, toDate],
  );
  return res.rows.map((r) => ({
    benchmark: r.benchmark as Benchmark,
    periodDate: toDateStr(r.period_date),
    price: Number(r.price),
    source: String(r.source_id),
    disagreement: Boolean(r.disagreement),
    spreadPct: r.spread_pct === null ? null : Number(r.spread_pct),
    updatedAt: toIso(r.updated_at),
  }));
}

/** Most recent resolved close (reference for live-quote sanity checks). */
export async function getLatestDailyPrice(
  db: Queryable,
  benchmark: Benchmark,
): Promise<DailyPrice | null> {
  const res = await db.query(
    `select * from daily_prices where benchmark = $1
      order by period_date desc limit 1`,
    [benchmark],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    benchmark: r.benchmark as Benchmark,
    periodDate: toDateStr(r.period_date),
    price: Number(r.price),
    source: String(r.source_id),
    disagreement: Boolean(r.disagreement),
    spreadPct: r.spread_pct === null ? null : Number(r.spread_pct),
    updatedAt: toIso(r.updated_at),
  };
}

/** Live/delayed observations in a lookback window (pct_move intraday basis). */
export async function getIntradayObservations(
  db: Queryable,
  benchmark: Benchmark,
  lookbackHours: number,
): Promise<{ price: number; observedAt: string }[]> {
  const res = await db.query(
    `select price, observed_at from price_observations
      where benchmark = $1
        and kind in ('live','delayed')
        and observed_at >= now() - ($2 || ' hours')::interval
      order by observed_at asc`,
    [benchmark, String(lookbackHours)],
  );
  return res.rows.map((r) => ({ price: Number(r.price), observedAt: toIso(r.observed_at) }));
}

/** Registry ids that are enabled in the DB catalog. */
export async function getEnabledSourceIds(db: Queryable): Promise<Set<string>> {
  const res = await db.query(`select id from sources where enabled`);
  return new Set(res.rows.map((r) => String(r.id)));
}

/* ── source health (rate gate + circuit breaker state) ────────── */

export interface SourceHealthRow {
  sourceId: string;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  nextAllowedAt: string | null;
  cooldownUntil: string | null;
  disabled: boolean;
}

export async function getSourceHealth(db: Queryable, sourceId: string): Promise<SourceHealthRow> {
  const res = await db.query(`select * from source_health where source_id = $1`, [sourceId]);
  const r = res.rows[0];
  if (!r) {
    await db.query(
      `insert into source_health (source_id) values ($1) on conflict do nothing`,
      [sourceId],
    );
    return {
      sourceId, lastSuccessAt: null, consecutiveFailures: 0,
      nextAllowedAt: null, cooldownUntil: null, disabled: false,
    };
  }
  return {
    sourceId,
    lastSuccessAt: r.last_success_at ? toIso(r.last_success_at) : null,
    consecutiveFailures: Number(r.consecutive_failures ?? 0),
    nextAllowedAt: r.next_allowed_at ? toIso(r.next_allowed_at) : null,
    cooldownUntil: r.cooldown_until ? toIso(r.cooldown_until) : null,
    disabled: Boolean(r.disabled),
  };
}

export async function recordSourceSuccess(
  db: Queryable,
  sourceId: string,
  nextAllowedAt: Date,
): Promise<void> {
  await db.query(
    `update source_health
        set last_success_at = now(), consecutive_failures = 0,
            cooldown_until = null, next_allowed_at = $2, updated_at = now()
      where source_id = $1`,
    [sourceId, nextAllowedAt.toISOString()],
  );
}

export async function recordSourceFailure(
  db: Queryable,
  sourceId: string,
  errorKind: SourceErrorKind,
  message: string,
  opts: { cooldownUntil?: Date; disable?: boolean; countsAsFailure: boolean },
): Promise<void> {
  await db.query(
    `update source_health
        set last_error_at = now(), last_error_kind = $2,
            last_error_message = left($3, 500),
            consecutive_failures = consecutive_failures + $4,
            cooldown_until = coalesce($5, cooldown_until),
            disabled = disabled or $6,
            updated_at = now()
      where source_id = $1`,
    [
      sourceId, errorKind, message,
      opts.countsAsFailure ? 1 : 0,
      opts.cooldownUntil?.toISOString() ?? null,
      opts.disable ?? false,
    ],
  );
}

/** Clear permanent disable + breaker counters (e.g. after fixing an API key). */
export async function reenableSource(db: Queryable, sourceId: string): Promise<void> {
  await db.query(
    `insert into source_health (source_id) values ($1)
     on conflict (source_id) do update
       set disabled = false,
           consecutive_failures = 0,
           cooldown_until = null,
           next_allowed_at = null,
           updated_at = now()`,
    [sourceId],
  );
}

/* ── row mapping helpers ──────────────────────────────────────── */

function rowToRecord(r: Record<string, unknown>): PriceRecord {
  return {
    benchmark: r.benchmark as Benchmark,
    price: Number(r.price),
    unit: "USD/bbl",
    currency: "USD",
    observedAt: toIso(r.observed_at),
    periodDate: r.period_date ? toDateStr(r.period_date) : undefined,
    kind: r.kind as PriceRecord["kind"],
    source: String(r.source_id),
    confidence: r.confidence as PriceRecord["confidence"],
    fetchedAt: toIso(r.fetched_at),
    raw: {
      price: Number(r.raw_price),
      unit: String(r.raw_unit),
      currency: String(r.raw_currency),
    },
    meta: (r.meta ?? undefined) as PriceRecord["meta"],
  };
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function toDateStr(v: unknown): string {
  // node-postgres parses `date` columns to a JS Date at LOCAL midnight,
  // so toISOString() would shift the day back for any TZ ahead of UTC.
  // Format from local components instead (live-caught: "as of" dates
  // rendered one day early on a UTC+3 machine).
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}
