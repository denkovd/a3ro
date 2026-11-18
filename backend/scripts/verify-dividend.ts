import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { pgConnectionConfig } from "../src/storage/pgConfig";
import { archiveDividendDataset, getStoredDividend, recordDividendFetch } from "../src/storage/dividendRepo";
import type { DividendDataset } from "../src/dividend/types";
import type { Queryable } from "../src/storage/db";
import { ensureDatabaseUrl } from "./loadEnv";

async function main() {
  ensureDatabaseUrl();
  const client = new Client({ ...pgConnectionConfig(), connectionTimeoutMillis: 5000, query_timeout: 5000 });
  await client.connect();
  try {
    await client.query("create temporary table horizon_verification_session (id integer)");
    const migration = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261018031814_macro_horizon_baseline.sql", import.meta.url)), "utf8");
    await client.query(migration.replaceAll("public.", "pg_temp."));
    const db: Queryable = { query: (sql, params) => client.query(sql.replaceAll("public.", "pg_temp."), params) };
    const first: DividendDataset = { source: "bls", retrievedAt: "2026-10-18T00:00:00Z", publicationDate: null, dataUrl: "https://api.bls.gov/", series: [{ key: "productivity", points: [{ period: "2026-Q2", value: 100, status: null }] }] };
    const hash = await archiveDividendDataset(db, first);
    await recordDividendFetch(db, { source: "bls", checkedAt: first.retrievedAt, health: "healthy", error: null }, hash);
    await archiveDividendDataset(db, { ...first, retrievedAt: "2026-10-19T00:00:00Z" });
    const revision = structuredClone(first);
    revision.retrievedAt = "2026-10-20T00:00:00Z";
    revision.series[0].points[0].value = 101;
    await archiveDividendDataset(db, revision);
    assert.equal((await getStoredDividend(db)).datasets[0].series[0].points[0].value, 101);
    await archiveDividendDataset(db, { ...first, retrievedAt: "2026-10-21T00:00:00Z" });
    assert.equal((await getStoredDividend(db)).datasets[0].series[0].points[0].value, 100);
    const count = await client.query("select count(*)::int as count from pg_temp.horizon_source_vintages");
    assert.equal(count.rows[0].count, 2);
    const policies = await client.query("select relrowsecurity from pg_class where relnamespace=pg_my_temp_schema() and relname in ('horizon_source_vintages','horizon_fetch_runs')");
    assert.equal(policies.rows.length, 2);
    assert.ok(policies.rows.every(row => row.relrowsecurity));
    console.log("Dividend PostgreSQL verification passed: temporary tables, idempotent retrieval, revision history, reversion ordering and RLS. No permanent tables changed.");
  } finally {
    await client.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Dividend verification failed"); process.exitCode = 1; });
