import type { Queryable } from "./db";
import type { RefineryEvent } from "../../../lib/oil/refineries";

export type StoredRefineryEvent = RefineryEvent & { id: string; refineryId: string; incidentId: string; verifiedAt: string; publishedAt: string | null; scope: "facility" | "unit" | "group" };

export async function upsertRefineryEvents(db: Queryable, events: StoredRefineryEvent[]) {
  if (!events.length) return 0;
  const rows = events.map(e => ({ id: e.id, refinery_id: e.refineryId, incident_id: e.incidentId, kind: e.kind, scope: e.scope, event_date: e.date, published_at: e.publishedAt, verified_at: e.verifiedAt, payload: e }));
  const result = await db.query(`insert into public.oil_refinery_events (id,refinery_id,incident_id,kind,scope,event_date,published_at,verified_at,payload)
    select id,refinery_id,incident_id,kind,scope,event_date,published_at,verified_at,payload from jsonb_to_recordset($1::jsonb)
    as x(id text,refinery_id text,incident_id text,kind text,scope text,event_date text,published_at timestamptz,verified_at timestamptz,payload jsonb)
    on conflict (id) do update set payload=excluded.payload, verified_at=excluded.verified_at, published_at=excluded.published_at,
    event_date=excluded.event_date,kind=excluded.kind,scope=excluded.scope,incident_id=excluded.incident_id, updated_at=now()
    where oil_refinery_events.verified_at <= excluded.verified_at`, [JSON.stringify(rows)]);
  return result.rowCount ?? 0;
}

export async function getRefineryEvents(db: Queryable): Promise<StoredRefineryEvent[]> {
  const rows = await db.query("select payload from public.oil_refinery_events order by published_at desc nulls last, id limit 1000");
  return rows.rows.map(r => r.payload as StoredRefineryEvent);
}

export async function recordRefineryCheck(db: Queryable, sourceId: string, ok: boolean, message: string | null, now: string) {
  await db.query(`insert into public.oil_refinery_source_checks (source_id,last_attempted_at,last_success_at,status,message) values ($1,$2,case when $3 then $2::timestamptz else null end,$4,$5)
    on conflict(source_id) do update set last_attempted_at=excluded.last_attempted_at,
    last_success_at=coalesce(excluded.last_success_at,oil_refinery_source_checks.last_success_at),status=excluded.status,message=excluded.message`, [sourceId,now,ok,ok ? "healthy" : "error",message]);
}

export async function getRefineryChecks(db: Queryable) {
  return (await db.query("select source_id, last_attempted_at, last_success_at, status from public.oil_refinery_source_checks order by source_id")).rows;
}
