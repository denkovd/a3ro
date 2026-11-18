import { createHash } from "node:crypto";
import { DIVIDEND_SOURCES } from "../dividend/indicators";
import type { DividendDataset, DividendSource, DividendSourceState } from "../dividend/types";
import type { Queryable } from "./db";

// Tables keep their original horizon_* names (migration 20261018031814) so the
// existing revision archive carries over to AI Dividend without a data migration.

export function dividendContentHash(dataset: DividendDataset): string {
  return createHash("sha256").update(JSON.stringify({ source: dataset.source, dataUrl: dataset.dataUrl, publicationDate: dataset.publicationDate, series: dataset.series })).digest("hex");
}

export async function archiveDividendDataset(db: Queryable, dataset: DividendDataset): Promise<string> {
  const hash = dividendContentHash(dataset);
  await db.query(`insert into public.horizon_source_vintages
    (source_key, content_hash, payload, first_retrieved_at, last_verified_at)
    values ($1,$2,$3::jsonb,$4,$4)
    on conflict (source_key, content_hash) do update
    set last_verified_at=greatest(horizon_source_vintages.last_verified_at, excluded.last_verified_at)`,
  [dataset.source, hash, JSON.stringify(dataset), dataset.retrievedAt]);
  return hash;
}

export async function recordDividendFetch(db: Queryable, state: DividendSourceState, hash: string | null): Promise<void> {
  await db.query(`insert into public.horizon_fetch_runs (source_key,checked_at,health,content_hash,error) values ($1,$2,$3,$4,$5)`,
    [state.source, state.checkedAt, state.health, hash, state.error]);
}

export async function getStoredDividend(db: Queryable): Promise<{ datasets: DividendDataset[]; states: DividendSourceState[] }> {
  const [vintages, runs] = await Promise.all([
    db.query(`select distinct on (source_key) source_key,payload,last_verified_at from public.horizon_source_vintages order by source_key,last_verified_at desc,first_retrieved_at desc`),
    db.query(`select distinct on (source_key) source_key,checked_at,health,error from public.horizon_fetch_runs order by source_key,checked_at desc,id desc`),
  ]);
  const datasets = vintages.rows.flatMap(row => {
    if (!DIVIDEND_SOURCES.includes(row.source_key as DividendSource)) return [];
    const payload = row.payload as DividendDataset;
    if (!payload || payload.source !== row.source_key || !Array.isArray(payload.series) || payload.series.some(series => !Array.isArray(series.points))) return [];
    return [{ ...payload, retrievedAt: new Date(String(row.last_verified_at)).toISOString() }];
  });
  const states = runs.rows.filter(row => DIVIDEND_SOURCES.includes(row.source_key as DividendSource)).map(row => ({
    source: row.source_key as DividendSource, health: row.health as DividendSourceState["health"],
    checkedAt: new Date(String(row.checked_at)).toISOString(), error: row.error == null ? null : String(row.error),
  }));
  return { datasets, states };
}
