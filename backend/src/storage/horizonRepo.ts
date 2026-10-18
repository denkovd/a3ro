import { createHash } from "node:crypto";
import { HORIZON_SOURCES } from "../horizon/indicators";
import type { HorizonDataset, HorizonSource, HorizonSourceState } from "../horizon/types";
import type { Queryable } from "./db";

export function horizonContentHash(dataset: HorizonDataset): string {
  return createHash("sha256").update(JSON.stringify({ source: dataset.source, dataUrl: dataset.dataUrl, publicationDate: dataset.publicationDate, series: dataset.series })).digest("hex");
}

export async function archiveHorizonDataset(db: Queryable, dataset: HorizonDataset): Promise<string> {
  const hash = horizonContentHash(dataset);
  await db.query(`insert into public.horizon_source_vintages
    (source_key, content_hash, payload, first_retrieved_at, last_verified_at)
    values ($1,$2,$3::jsonb,$4,$4)
    on conflict (source_key, content_hash) do update
    set last_verified_at=greatest(horizon_source_vintages.last_verified_at, excluded.last_verified_at)`,
  [dataset.source, hash, JSON.stringify(dataset), dataset.retrievedAt]);
  return hash;
}

export async function recordHorizonFetch(db: Queryable, state: HorizonSourceState, hash: string | null): Promise<void> {
  await db.query(`insert into public.horizon_fetch_runs (source_key,checked_at,health,content_hash,error) values ($1,$2,$3,$4,$5)`,
    [state.source, state.checkedAt, state.health, hash, state.error]);
}

export async function getStoredHorizon(db: Queryable): Promise<{ datasets: HorizonDataset[]; states: HorizonSourceState[] }> {
  const [vintages, runs] = await Promise.all([
    db.query(`select distinct on (source_key) source_key,payload,last_verified_at from public.horizon_source_vintages order by source_key,last_verified_at desc,first_retrieved_at desc`),
    db.query(`select distinct on (source_key) source_key,checked_at,health,error from public.horizon_fetch_runs order by source_key,checked_at desc,id desc`),
  ]);
  const datasets = vintages.rows.flatMap(row => {
    if (!HORIZON_SOURCES.includes(row.source_key as HorizonSource)) return [];
    const payload = row.payload as HorizonDataset;
    if (!payload || payload.source !== row.source_key || !Array.isArray(payload.series) || payload.series.some(series => !Array.isArray(series.points))) return [];
    return [{ ...payload, retrievedAt: new Date(String(row.last_verified_at)).toISOString() }];
  });
  const states = runs.rows.filter(row => HORIZON_SOURCES.includes(row.source_key as HorizonSource)).map(row => ({
    source: row.source_key as HorizonSource, health: row.health as HorizonSourceState["health"],
    checkedAt: new Date(String(row.checked_at)).toISOString(), error: row.error == null ? null : String(row.error),
  }));
  return { datasets, states };
}
