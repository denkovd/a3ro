import { buildExecuteNewsletter } from "../../../backend/src/execute/format";
import { EXECUTE_STRATEGY_VERSION, type ExecutePayload } from "../../../backend/src/execute/types";
import { createDb } from "../../../backend/src/storage/db";
import { getExecuteLastRun, getExecuteRecord, listExecuteUpcoming } from "../../../backend/src/storage/executeRepo";

// Premium (lib/access.ts → middleware): signals, open paper position, track records, newsletter block.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const now = new Date();
  try {
    const db = await createDb();
    const [upcoming, paper, backtest, engine] = await Promise.all([
      listExecuteUpcoming(db, now), getExecuteRecord(db, "paper"), getExecuteRecord(db, "backtest"), getExecuteLastRun(db),
    ]);
    const openTrade = paper.trades.find(t => t.status === "open" || t.status === "pending") ?? null;
    const body: ExecutePayload = {
      version: EXECUTE_STRATEGY_VERSION, generatedAt: now.toISOString(), engine, upcoming, openTrade, paper, backtest,
      newsletter: buildExecuteNewsletter(upcoming, paper.trades, now),
    };
    return Response.json(body, { headers: PRIVATE });
  } catch {
    console.error("Execute data could not be read");
    return Response.json({ error: "Execute data is unavailable right now" }, { status: 503, headers: PRIVATE });
  }
}
