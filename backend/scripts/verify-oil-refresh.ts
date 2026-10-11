import { ensureDatabaseUrl } from "./loadEnv";
import { Client } from "pg";

// Read-only: use existing local database credentials without retrieving secrets.
ensureDatabaseUrl();
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("begin read only");
  const prices = await client.query("select source_id,last_success_at,last_error_at,last_error_kind,consecutive_failures,disabled from source_health where source_id in ('eia','yfinance','fred','alphavantage') order by source_id");
  const physical = await client.query("select distinct on (corridor,metric) corridor,metric,period_date::text as period_date,source_id,fetched_at from corridor_metrics order by corridor,metric,period_date desc");
  const refineries = await client.query("select source_id,last_attempted_at,last_success_at,status from oil_refinery_source_checks order by source_id");
  await client.query("rollback");
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), prices: prices.rows, physical: physical.rows, refineries: refineries.rows }, null, 2));
} catch {
  console.error("Oil refresh verification unavailable");
  process.exitCode = 1;
} finally { await client.end(); }
