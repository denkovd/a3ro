import type { AustraliaFetchState, AustraliaIndicator, AustraliaObservation, FetchHealth } from "../australia/types";
import { AUSTRALIA_REGISTRY, isAustraliaIndicator } from "../australia/registry";
import type { Queryable } from "./db";

const mapObservation = (r: Record<string, unknown>): AustraliaObservation => ({
  indicator: String(r.indicator) as AustraliaIndicator, title: AUSTRALIA_REGISTRY[r.indicator as AustraliaIndicator].title, value: Number(r.value), unit: String(r.unit),
  unitMultiplier: r.unit_multiplier == null ? null : Number(r.unit_multiplier), frequency: String(r.frequency) as AustraliaObservation["frequency"],
  adjustment: String(r.adjustment), referencePeriod: String(r.reference_period), sourceUrl: String(r.source_url),
  publicationDate: r.publication_date == null ? null : String(r.publication_date).slice(0, 10), sourceStatus: r.source_status == null ? null : String(r.source_status),
  sourceComment: r.source_comment == null ? null : String(r.source_comment),
  firstRetrievedAt: new Date(String(r.first_retrieved_at)).toISOString(), lastVerifiedAt: new Date(String(r.last_verified_at)).toISOString(),
});

/** Rows per statement; a series is ~130 rows, so this is normally one statement per series. */
const UPSERT_CHUNK = 500;

/**
 * Set-based upsert: one round trip per chunk, not per row. The cron runs in a Vercel region far from
 * the database, so the old per-row loop cost ~27s per series and the cycle hit the 300s limit.
 * Value/unit/status changes on existing rows are still written to australia_watch_revisions.
 */
export async function upsertAustraliaObservations(db: Queryable, rows: AustraliaObservation[]): Promise<number> {
  // One statement cannot update the same key twice; keep the last row per key, as the per-row loop did.
  const unique = [...new Map(rows.map((r) => [`${r.indicator}\u0000${r.referencePeriod}`, r])).values()];
  for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
    const chunk = unique.slice(i, i + UPSERT_CHUNK);
    const col = <K extends keyof AustraliaObservation>(k: K) => chunk.map((r) => r[k]);
    await db.query(`with input as (
      select * from unnest($1::text[], $2::text[], $3::double precision[], $4::text[], $5::int[], $6::text[], $7::text[], $8::text[],
        $9::date[], $10::text[], $11::text[], $12::timestamptz[], $13::timestamptz[])
        as t(indicator, reference_period, value, unit, unit_multiplier, frequency, adjustment, source_url, publication_date, source_status, source_comment, first_retrieved_at, last_verified_at)
    ), previous as materialized (
      select o.* from australia_watch_observations o join input i on i.indicator = o.indicator and i.reference_period = o.reference_period for update of o
    ), audit as (
      insert into australia_watch_revisions (indicator, reference_period, previous_value, next_value, previous_meta, next_meta)
      select p.indicator, p.reference_period, p.value, i.value, to_jsonb(p),
        jsonb_build_object('value', i.value, 'unit', i.unit, 'unitMultiplier', i.unit_multiplier, 'sourceStatus', i.source_status, 'sourceComment', i.source_comment)
      from previous p join input i on i.indicator = p.indicator and i.reference_period = p.reference_period
      where p.value is distinct from i.value or p.unit is distinct from i.unit or p.unit_multiplier is distinct from i.unit_multiplier
        or p.source_status is distinct from i.source_status or p.source_comment is distinct from i.source_comment
    ) insert into australia_watch_observations
      (indicator, reference_period, value, unit, unit_multiplier, frequency, adjustment, source_url, publication_date, source_status, source_comment, first_retrieved_at, last_verified_at)
      select i.* from input i cross join (select count(*) from previous) locked
      on conflict (indicator, reference_period) do update set value=excluded.value, unit=excluded.unit, unit_multiplier=excluded.unit_multiplier,
      frequency=excluded.frequency, adjustment=excluded.adjustment, source_url=excluded.source_url, publication_date=excluded.publication_date,
      source_status=excluded.source_status, source_comment=excluded.source_comment, last_verified_at=excluded.last_verified_at`,
      [col("indicator"), col("referencePeriod"), col("value"), col("unit"), col("unitMultiplier"), col("frequency"), col("adjustment"), col("sourceUrl"),
        col("publicationDate"), col("sourceStatus"), col("sourceComment"), col("firstRetrievedAt"), col("lastVerifiedAt")]);
  }
  return rows.length;
}

export async function recordAustraliaFetchRun(db: Queryable, indicator: AustraliaIndicator, startedAt: string, health: "healthy" | "degraded", observationCount: number, error: string | null): Promise<void> {
  await db.query(`insert into australia_watch_fetch_runs (indicator, started_at, finished_at, health, observation_count, error) values ($1,$2,now(),$3,$4,$5)`, [indicator, startedAt, health, observationCount, error]);
}

export async function getAustraliaObservations(db: Queryable, indicator?: AustraliaIndicator): Promise<AustraliaObservation[]> {
  const res = await db.query(`select * from australia_watch_observations${indicator ? " where indicator = $1" : ""} order by indicator, reference_period asc`, indicator ? [indicator] : []);
  // Rows for an indicator no longer in the registry are kept in storage but not served.
  return res.rows.filter((r) => isAustraliaIndicator(String(r.indicator))).map(mapObservation);
}

export async function getAustraliaFetchStates(db: Queryable): Promise<Record<string, AustraliaFetchState>> {
  const res = await db.query(`select distinct on (indicator) indicator, health, finished_at, error from australia_watch_fetch_runs order by indicator, finished_at desc`);
  return Object.fromEntries(res.rows.map((r) => [String(r.indicator), { health: String(r.health) as FetchHealth, retrievedAt: r.finished_at ? new Date(String(r.finished_at)).toISOString() : null, error: r.error == null ? null : String(r.error) }]));
}
