import { createHash } from "node:crypto";
import { SIGNAL_SOURCES, type SignalDataset, type SignalDatasets, type SignalSource } from "../dividend/signals/types";
import type { Queryable } from "./db";

export interface SignalSourceState {
  source: SignalSource;
  health: "healthy" | "unavailable";
  checkedAt: string | null;
  error: string | null;
}

export function signalContentHash(dataset: SignalDataset): string {
  return createHash("sha256").update(JSON.stringify({ source: dataset.source, payload: dataset.payload })).digest("hex");
}

export async function archiveSignal(db: Queryable, dataset: SignalDataset): Promise<string> {
  const hash = signalContentHash(dataset);
  await db.query(`insert into public.dividend_signal_vintages (source_key, content_hash, payload, data_url, first_retrieved_at, last_verified_at)
    values ($1,$2,$3::jsonb,$4,$5,$5)
    on conflict (source_key, content_hash) do update
    set last_verified_at=greatest(dividend_signal_vintages.last_verified_at, excluded.last_verified_at)`,
  [dataset.source, hash, JSON.stringify(dataset.payload), dataset.dataUrl, dataset.retrievedAt]);
  return hash;
}

export async function recordSignalRun(db: Queryable, state: SignalSourceState, hash: string | null): Promise<void> {
  await db.query(`insert into public.dividend_signal_runs (source_key, checked_at, health, content_hash, error) values ($1,$2,$3,$4,$5)`,
    [state.source, state.checkedAt, state.health, hash, state.error]);
}

export async function getStoredSignals(db: Queryable): Promise<{ datasets: SignalDatasets; states: SignalSourceState[] }> {
  const [vintages, runs] = await Promise.all([
    db.query(`select distinct on (source_key) source_key, payload, data_url, last_verified_at from public.dividend_signal_vintages order by source_key, last_verified_at desc, first_retrieved_at desc`),
    db.query(`select distinct on (source_key) source_key, checked_at, health, error from public.dividend_signal_runs order by source_key, checked_at desc, id desc`),
  ]);
  const datasets: SignalDatasets = {};
  for (const row of vintages.rows) {
    const source = row.source_key as SignalSource;
    if (!SIGNAL_SOURCES.includes(source) || !row.payload || typeof row.payload !== "object") continue;
    (datasets as Record<string, SignalDataset>)[source] = { source, payload: row.payload as never, dataUrl: String(row.data_url), retrievedAt: new Date(String(row.last_verified_at)).toISOString() };
  }
  const states = runs.rows.filter(row => SIGNAL_SOURCES.includes(row.source_key as SignalSource)).map(row => ({
    source: row.source_key as SignalSource,
    health: row.health === "healthy" ? "healthy" as const : "unavailable" as const,
    checkedAt: new Date(String(row.checked_at)).toISOString(),
    error: row.error == null ? null : String(row.error),
  }));
  return { datasets, states };
}
