/* World Bank monthly commodity prices (roadmap #126, migration 035_commodity_monthly.sql). One row per series. */
import type { Queryable } from "./db";
import type { PinkSeries, PinkSeriesId } from "../commodities/pinkSheet";

export const COMMODITY_MONTHLY_DDL = `
create table if not exists commodity_monthly (
  series      text primary key,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);
revoke all privileges on table commodity_monthly from anon, authenticated, public;
alter table commodity_monthly enable row level security;`;

export async function ensureCommodityMonthlyTable(db: Queryable): Promise<void> {
  await db.query(COMMODITY_MONTHLY_DDL);
}

export async function saveCommoditySeries(db: Queryable, s: PinkSeries): Promise<void> {
  await db.query(
    `insert into commodity_monthly (series, payload) values ($1, $2)
     on conflict (series) do update set payload = excluded.payload, updated_at = now()`,
    [s.id, JSON.stringify(s)],
  );
}

export async function loadCommoditySeries(db: Queryable, id: PinkSeriesId): Promise<PinkSeries | null> {
  const r = await db.query(`select payload from commodity_monthly where series = $1`, [id]);
  const row = r.rows[0] as { payload?: unknown } | undefined;
  if (!row?.payload) return null;
  return (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as PinkSeries;
}
