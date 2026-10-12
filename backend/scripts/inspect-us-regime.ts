import { ensureDatabaseUrl } from "./loadEnv";
import { createDb } from "../src/storage/db";
import { getLatestMacroSnapshot } from "../src/storage/macroRepo";

ensureDatabaseUrl();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured locally; cannot inspect the stored US regime.");
  process.exit(1);
}
try {
  const db = await createDb();
  const snap = await getLatestMacroSnapshot(db);
  const columns = await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'macro_snapshots'");
  const present = new Set(columns.rows.map((row) => String(row.column_name)));
  const missingColumns = ["market_regime", "cycles", "liquidity_score", "allocation_weights"].filter((column) => !present.has(column));
  console.log(JSON.stringify(snap ? {
    runDate: snap.runDate,
    computedAt: snap.computedAt,
    quadrant: snap.quadrant,
    marketRegime: snap.marketRegime,
    sourcePeriods: snap.cycles.filter((c) => c.key === "growth" || c.key === "inflation"),
    missingColumns,
  } : { snapshot: null }, null, 2));
  process.exit(0);
} catch (error) {
  const code = (error as { code?: string }).code;
  console.error(`Snapshot read failed; database unavailable from this environment${code ? ` (${code})` : ""}.`);
  process.exit(1);
}
