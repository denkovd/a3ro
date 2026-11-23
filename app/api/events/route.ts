// Anonymous interaction events (roadmap #46). Write-only and best-effort: the page never waits on
// it and never sees an error. Same-site JSON only (readLeadRequest), bounded per client.
import { cleanSiteEvent, createDb, insertSiteEvent } from "@a3ro/oil-backend";
import { isIP } from "node:net";
import { LeadRequestError, readLeadRequest } from "../_lib/leadRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const CLIENT_LIMIT = 60;
const INSTANCE_LIMIT = 2_000;
let windowEnds = 0;
let total = 0;
const clients = new Map<string, number>();

function overLimit(request: Request): boolean {
  const now = Date.now();
  if (now >= windowEnds) { windowEnds = now + WINDOW_MS; total = 0; clients.clear(); }
  const forwarded = process.env.VERCEL === "1" ? request.headers.get("x-forwarded-for") ?? "" : "";
  const key = isIP(forwarded) ? forwarded : "unidentified";
  const count = clients.get(key) ?? 0;
  if (total >= INSTANCE_LIMIT || count >= CLIENT_LIMIT) return true;
  total++;
  clients.set(key, count + 1);
  return false;
}

const NO_CONTENT = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (overLimit(request)) return new Response(null, { status: 429, headers: { "Cache-Control": "no-store" } });
  try {
    const event = cleanSiteEvent(await readLeadRequest(request));
    if (!event) return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
    await insertSiteEvent(await createDb(), event);
    return NO_CONTENT();
  } catch (error) {
    if (error instanceof LeadRequestError) return new Response(null, { status: error.status, headers: { "Cache-Control": "no-store" } });
    // Missing table, DB down: drop the event quietly.
    return NO_CONTENT();
  }
}
