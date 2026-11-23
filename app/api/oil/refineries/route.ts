import { createDb } from "@a3ro/oil-backend";
import { getRefineryEvents, getRefineryChecks } from "../../../../backend/src/storage/refineryRepo";
import { withErrorLog } from "../../_lib/errorLog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withErrorLog("api:oil/refineries", async function GET() {
  try {
    const db = await createDb();
    const [events, checks] = await Promise.all([getRefineryEvents(db), getRefineryChecks(db)]);
    return Response.json({ events, checks });
  } catch {
    return Response.json({ error: "Refinery evidence feed unavailable" }, { status: 503 });
  }
});
