/* Crypto fundamentals snapshots (roadmap #82, migration 034_crypto_fundamentals.sql). One row per day. */
import type { Queryable } from "./db";
import type { CryptoSnapshot } from "../crypto/defillama";

export const CRYPTO_TABLE_DDL = `
create table if not exists crypto_fundamentals (
  as_of       date primary key,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
revoke all privileges on table crypto_fundamentals from anon, authenticated, public;
alter table crypto_fundamentals enable row level security;`;

export async function ensureCryptoTable(db: Queryable): Promise<void> {
  await db.query(CRYPTO_TABLE_DDL);
}

export async function saveCryptoSnapshot(db: Queryable, snap: CryptoSnapshot): Promise<void> {
  await db.query(
    `insert into crypto_fundamentals (as_of, payload) values ($1, $2)
     on conflict (as_of) do update set payload = excluded.payload, created_at = now()`,
    [snap.asOf, JSON.stringify(snap)],
  );
  // Keep a year of daily snapshots; the monthly history inside each snapshot covers the charts.
  await db.query(`delete from crypto_fundamentals where as_of < current_date - 400`);
}

export async function latestCryptoSnapshot(db: Queryable): Promise<CryptoSnapshot | null> {
  const r = await db.query(`select payload from crypto_fundamentals order by as_of desc limit 1`);
  const row = r.rows[0] as { payload?: unknown } | undefined;
  if (!row?.payload) return null;
  return (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as CryptoSnapshot;
}
