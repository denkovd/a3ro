import { ensureDatabaseUrl } from "./loadEnv";
import { Client } from "pg";
import { REFINERIES } from "../../lib/oil/refineries";
import { upsertRefineryEvents, type StoredRefineryEvent } from "../src/storage/refineryRepo";

// One-time persistence of reviewed PDF history. Verification remains the review
// date; neither publication dates nor a live successful source poll are invented.
ensureDatabaseUrl();
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const events: StoredRefineryEvent[] = REFINERIES.filter(r => r.id === "haifa-bazan").flatMap(r => r.events.map(e => ({
    ...e, id: e.id!, refineryId: r.id, incidentId: e.incidentId ?? e.id!, scope: e.scope ?? "facility",
    publishedAt: null, verifiedAt: `${r.reviewedAt}T00:00:00Z`,
  })));
  console.log(JSON.stringify({ reviewedEventsStored: await upsertRefineryEvents(client, events) }));
} catch {
  console.error("Reviewed refinery history could not be stored");
  process.exitCode = 1;
} finally { await client.end(); }
