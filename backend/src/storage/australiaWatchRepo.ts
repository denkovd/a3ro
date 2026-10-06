import type { AustraliaFetchState, AustraliaIndicator, AustraliaObservation, FetchHealth } from "../australia/types";
import { AUSTRALIA_SERIES } from "../australia/watch";
import type { Queryable } from "./db";

const mapObservation = (r: Record<string, unknown>): AustraliaObservation => ({
  indicator: String(r.indicator) as AustraliaIndicator, title: AUSTRALIA_SERIES[r.indicator as AustraliaIndicator].title, value: Number(r.value), unit: String(r.unit),
  unitMultiplier: r.unit_multiplier == null ? null : Number(r.unit_multiplier), frequency: String(r.frequency) as AustraliaObservation["frequency"],
  adjustment: String(r.adjustment), referencePeriod: String(r.reference_period), sourceUrl: String(r.source_url),
  publicationDate: r.publication_date == null ? null : String(r.publication_date).slice(0, 10), sourceStatus: r.source_status == null ? null : String(r.source_status),
  sourceComment: r.source_comment == null ? null : String(r.source_comment),
  firstRetrievedAt: new Date(String(r.first_retrieved_at)).toISOString(), lastVerifiedAt: new Date(String(r.last_verified_at)).toISOString(),
});

export async function upsertAustraliaObservations(db: Queryable, rows: AustraliaObservation[]): Promise<number> {
  for (const row of rows) {
    await db.query(`with previous as materialized (
      select * from australia_watch_observations where indicator=$1 and reference_period=$2 for update
    ), audit as (
      insert into australia_watch_revisions (indicator, reference_period, previous_value, next_value, previous_meta, next_meta)
      select $1,$2,value,$3,to_jsonb(previous),jsonb_build_object('value',$3::double precision,'unit',$4::text,'unitMultiplier',$5::int,'sourceStatus',$10::text,'sourceComment',$11::text)
      from previous where value is distinct from $3 or unit is distinct from $4 or unit_multiplier is distinct from $5
        or source_status is distinct from $10 or source_comment is distinct from $11
    ) insert into australia_watch_observations
      (indicator, reference_period, value, unit, unit_multiplier, frequency, adjustment, source_url, publication_date, source_status, source_comment, first_retrieved_at, last_verified_at)
      select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13 from (select count(*) from previous) locked
      on conflict (indicator, reference_period) do update set value=excluded.value, unit=excluded.unit, unit_multiplier=excluded.unit_multiplier,
      frequency=excluded.frequency, adjustment=excluded.adjustment, source_url=excluded.source_url, publication_date=excluded.publication_date,
      source_status=excluded.source_status, source_comment=excluded.source_comment, last_verified_at=excluded.last_verified_at`,
      [row.indicator, row.referencePeriod, row.value, row.unit, row.unitMultiplier, row.frequency, row.adjustment, row.sourceUrl, row.publicationDate, row.sourceStatus, row.sourceComment, row.firstRetrievedAt, row.lastVerifiedAt]);
  }
  return rows.length;
}

export async function recordAustraliaFetchRun(db: Queryable, indicator: AustraliaIndicator, startedAt: string, health: "healthy" | "degraded", observationCount: number, error: string | null): Promise<void> {
  await db.query(`insert into australia_watch_fetch_runs (indicator, started_at, finished_at, health, observation_count, error) values ($1,$2,now(),$3,$4,$5)`, [indicator, startedAt, health, observationCount, error]);
}

export async function getAustraliaObservations(db: Queryable, indicator?: AustraliaIndicator): Promise<AustraliaObservation[]> {
  const res = await db.query(`select * from australia_watch_observations${indicator ? " where indicator = $1" : ""} order by indicator, reference_period asc`, indicator ? [indicator] : []);
  return res.rows.map(mapObservation);
}

export async function getAustraliaFetchStates(db: Queryable): Promise<Record<string, AustraliaFetchState>> {
  const res = await db.query(`select distinct on (indicator) indicator, health, finished_at, error from australia_watch_fetch_runs order by indicator, finished_at desc`);
  return Object.fromEntries(res.rows.map((r) => [String(r.indicator), { health: String(r.health) as FetchHealth, retrievedAt: r.finished_at ? new Date(String(r.finished_at)).toISOString() : null, error: r.error == null ? null : String(r.error) }]));
}
