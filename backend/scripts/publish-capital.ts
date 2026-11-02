import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { setDefaultResultOrder } from "node:dns";
import { ensureDatabaseUrl } from "./loadEnv";
import { pgConnectionConfig } from "../src/storage/pgConfig";
import { CAPITAL_METHODOLOGY, validateCapitalDataset, type CapitalDataset } from "../../lib/costOfCapital";

ensureDatabaseUrl();
setDefaultResultOrder("ipv4first");
const dataset = JSON.parse(await readFile(new URL("../../public/data/cost-of-capital.json", import.meta.url), "utf8")) as CapitalDataset;
validateCapitalDataset(dataset);
if (!dataset.observations.length) throw new Error("Refusing to publish an empty capital dataset.");
const client = new Client(pgConnectionConfig());
try {
  await client.connect();
  await client.query("begin");
  let published = 0;
  for (const row of dataset.observations) {
    const result = await client.query(
      `insert into cost_of_capital_observations (methodology, market_id, as_of, payload)
       values ($1, $2, $3, $4::jsonb)
       on conflict (methodology, market_id, as_of) do update set payload = excluded.payload, published_at = now()
       where (cost_of_capital_observations.payload->>'equityCheckedAt')::timestamptz <= (excluded.payload->>'equityCheckedAt')::timestamptz
         and (cost_of_capital_observations.payload->>'bondCheckedAt')::timestamptz <= (excluded.payload->>'bondCheckedAt')::timestamptz
         and cost_of_capital_observations.payload is distinct from excluded.payload`,
      [CAPITAL_METHODOLOGY, row.marketId, row.asOf, JSON.stringify(row)],
    );
    published += result.rowCount ?? 0;
  }
  await client.query("commit");
  const verification = await client.query("select market_id, max(as_of)::text as as_of from cost_of_capital_observations where methodology = $1 group by market_id order by market_id", [CAPITAL_METHODOLOGY]);
  console.log(JSON.stringify({ published, latest: verification.rows }, null, 2));
} catch {
  await client.query("rollback").catch(() => undefined);
  // Connection errors can contain credentials; preserve those only within the driver, never logs.
  console.error("Capital database publication failed. Check the database connection and migration; saved source data is intact.");
  process.exitCode = 1;
} finally { await client.end(); }
