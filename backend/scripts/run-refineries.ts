import { ensureDatabaseUrl } from "./loadEnv";
import { createDb } from "../src/storage/db";
import { runRefineryCycle } from "../src/ingest/refineryCycle";
ensureDatabaseUrl();
const report = await runRefineryCycle(await createDb());
console.log(JSON.stringify(report, null, 2));
process.exit(report.polled.some(p => !p.ok) ? 1 : 0);
