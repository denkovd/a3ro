import { createHash } from "node:crypto";
import type { ValueChainDataset } from "../dividend/valueChain/types";
import type { Queryable } from "./db";

/** Hash the figures only, so an unchanged dataset is not stored twice. */
export function valueChainContentHash(dataset: ValueChainDataset): string {
  return createHash("sha256").update(JSON.stringify({ companies: dataset.companies, failures: dataset.failures })).digest("hex");
}

export async function archiveValueChain(db: Queryable, dataset: ValueChainDataset): Promise<string> {
  const hash = valueChainContentHash(dataset);
  await db.query(`insert into public.value_chain_vintages (content_hash, payload, first_retrieved_at, last_verified_at)
    values ($1,$2::jsonb,$3,$3)
    on conflict (content_hash) do update
    set last_verified_at=greatest(value_chain_vintages.last_verified_at, excluded.last_verified_at)`,
  [hash, JSON.stringify(dataset), dataset.retrievedAt]);
  return hash;
}

export async function getStoredValueChain(db: Queryable): Promise<ValueChainDataset | null> {
  const result = await db.query(`select payload, last_verified_at from public.value_chain_vintages order by last_verified_at desc, first_retrieved_at desc limit 1`);
  const row = result.rows[0];
  const payload = row?.payload as ValueChainDataset | undefined;
  if (!payload || payload.version !== 1 || !Array.isArray(payload.companies) || !Array.isArray(payload.failures)) return null;
  return { ...payload, retrievedAt: new Date(String(row!.last_verified_at)).toISOString() };
}
