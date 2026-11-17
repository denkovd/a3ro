/* ────────────────────────────────────────────────────────────────
   IMF PortWatch gate WEEKLY-SPREAD adapter — the distribution of each
   gate's 7-day average over the same 1y / 5y windows that
   sources/portwatchBaselines.ts summarises day by day. Sibling to
   that adapter (same endpoint, same CHOKEPOINTS list, same window
   arithmetic) but a different query shape: the server's statistics
   support cannot average over a trailing week, so this fetches the
   daily ROWS for all six gates and computes the spread locally in
   core/weeklySpread.ts.

   Endpoint (same service as portwatch.ts):
     GET …/Daily_Chokepoints_Data/FeatureServer/0/query
       ?where=portid IN (…) AND date >= DATE '{from5y − 7d}'
       &outFields=portid,date,n_tanker,capacity_tanker
       &orderByFields=portid,date
       &resultOffset={n}&resultRecordCount=2000
       &returnGeometry=false&f=json
   ~11,000 rows (6 gates × 5 years), paged with resultOffset until the
   server stops reporting `exceededTransferLimit`. Layer metadata read
   2026-11-17: supportsPagination true, supportsOrderBy true,
   maxRecordCount 10000, `date` esriFieldTypeDateOnly.

   LIVE-VERIFICATION CAVEAT (read before "fixing" a parse error):
   this paged row query has NOT been observed against the live
   endpoint. On 2026-11-17 every /query request to this service
   (including the daily query portwatch.ts makes) answered
     { "error": { "code": 499, "message": "Token Required" } }
   from an anonymous client, while the layer metadata stayed public.
   The row shape below is therefore the one portwatch.ts already
   parses in production (attributes.date / n_tanker / capacity_tanker)
   plus `portid`, not a payload captured for this query.
   FAIL-LOUD CONTRACT (same as portwatchBaselines.ts): any shape
   mismatch throws SourceError("bad_payload") with a ~200-char snippet,
   and a token/authorisation error body is classified "auth", so the
   first run surfaces a problem instead of silently writing nothing.

   Refresh expectation: called by runGateSpreadCycle
   (ingest/gateSpreadCycle.ts) roughly monthly, never per cron tick.
──────────────────────────────────────────────────────────────── */

import { BaselineWindow, CorridorId, WeeklySpread } from "../core/corridorTypes";
import { SourceError } from "../core/types";
import { DailyValue, weeklySpread, WEEK_DAYS } from "../core/weeklySpread";
import { getJsonForSource } from "./http";
import { CHOKEPOINTS, tonsToMegatons } from "./portwatch";

const SOURCE_ID = "portwatch-weekly";
const BASE_URL =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query";

const DAY_MS = 86_400_000;
const PAGE_SIZE = 2000;
/** 6 gates × 5 years ≈ 11k rows ≈ 6 pages; this is a runaway guard. */
const MAX_PAGES = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function minusDays(d: Date, days: number): Date {
  return new Date(d.getTime() - days * DAY_MS);
}

/** One (corridor, metric, win) spread — keyed like corridor_baselines. */
export interface GateWeeklySpreadRow {
  corridor: CorridorId;
  metric: "tanker_transits" | "tanker_volume";
  win: BaselineWindow;
  weekly: WeeklySpread;
}

interface RowAttributes {
  portid?: unknown;
  date?: unknown;
  n_tanker?: unknown;
  capacity_tanker?: unknown;
}

interface RowsResponse {
  exceededTransferLimit?: boolean;
  features?: { attributes?: RowAttributes }[];
  error?: { code?: number; message?: string };
}

function buildUrl(where: string, offset: number): string {
  const p = new URLSearchParams();
  p.set("where", where);
  p.set("outFields", "portid,date,n_tanker,capacity_tanker");
  p.set("orderByFields", "portid,date");
  p.set("resultOffset", String(offset));
  p.set("resultRecordCount", String(PAGE_SIZE));
  p.set("returnGeometry", "false");
  p.set("f", "json");
  return `${BASE_URL}?${p.toString()}`;
}

function coerceNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface GateDays {
  transits: DailyValue[];
  volume: DailyValue[];
}

/** Every daily row since `fromDate` for all gates, grouped by portid. */
async function fetchDailyRows(fromDate: string): Promise<Map<string, GateDays>> {
  const inList = CHOKEPOINTS.map((c) => `'${c.portid}'`).join(",");
  const where = `portid IN (${inList}) AND date >= DATE '${fromDate}'`;
  const pauseMs = process.env.NODE_ENV === "test" ? 0 : 250;

  const byPortid = new Map<string, GateDays>();
  let offset = 0;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      throw new SourceError(SOURCE_ID, "bad_payload", `PortWatch daily rows did not finish within ${MAX_PAGES} pages`);
    }
    const body = await getJsonForSource<RowsResponse>(SOURCE_ID, buildUrl(where, offset));

    if (body.error) {
      const message = body.error.message ?? `code ${body.error.code ?? "?"}`;
      const auth = body.error.code === 498 || body.error.code === 499 || /token/i.test(message);
      throw new SourceError(SOURCE_ID, auth ? "auth" : "upstream_error", `PortWatch daily rows error body: ${message}`);
    }
    if (!Array.isArray(body.features)) {
      throw new SourceError(
        SOURCE_ID,
        "bad_payload",
        `unexpected PortWatch daily rows response shape: ${JSON.stringify(body).slice(0, 200)}`,
      );
    }

    for (const feature of body.features) {
      const attrs = feature.attributes;
      if (!attrs || typeof attrs.portid !== "string" || typeof attrs.date !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/.test(attrs.date)) {
        throw new SourceError(
          SOURCE_ID,
          "bad_payload",
          `PortWatch daily row missing portid/date: ${JSON.stringify(feature).slice(0, 200)}`,
        );
      }
      let gate = byPortid.get(attrs.portid);
      if (!gate) {
        gate = { transits: [], volume: [] };
        byPortid.set(attrs.portid, gate);
      }
      // null counts are gaps, not zeros — same convention as portwatch.ts.
      const transits = coerceNum(attrs.n_tanker);
      const tons = coerceNum(attrs.capacity_tanker);
      if (transits !== null) gate.transits.push({ date: attrs.date, value: transits });
      if (tons !== null) gate.volume.push({ date: attrs.date, value: tonsToMegatons(tons) });
    }

    if (body.exceededTransferLimit !== true || body.features.length === 0) break;
    offset += body.features.length;
    if (pauseMs > 0) await sleep(pauseMs);
  }
  return byPortid;
}

/**
 * Weekly spreads for every gate × metric × window that has enough
 * history. Windows use the same arithmetic as fetchGateBaselines
 * (1y = 365 days back, 5y = 5 × 365 days back, both ending today), so
 * a spread always describes the same period as the mean it sits next to.
 */
export async function fetchGateWeeklySpreads(now: Date = new Date()): Promise<GateWeeklySpreadRow[]> {
  const to = toYmd(now);
  const from1y = toYmd(minusDays(now, 365));
  const from5y = toYmd(minusDays(now, 5 * 365));
  // One extra week of rows so the first windows of the 5y sample are complete.
  const fetchFrom = toYmd(minusDays(now, 5 * 365 + WEEK_DAYS));

  const byPortid = await fetchDailyRows(fetchFrom);

  const rows: GateWeeklySpreadRow[] = [];
  for (const cfg of CHOKEPOINTS) {
    const gate = byPortid.get(cfg.portid);
    if (!gate) continue; // a gate with no rows gets no spread (known gap, not an error)
    const windows: [BaselineWindow, string][] = [["1y", from1y], ["5y", from5y]];
    for (const [win, from] of windows) {
      const transits = weeklySpread(gate.transits, from, to);
      if (transits) rows.push({ corridor: cfg.corridor, metric: "tanker_transits", win, weekly: transits });
      const volume = weeklySpread(gate.volume, from, to);
      if (volume) rows.push({ corridor: cfg.corridor, metric: "tanker_volume", win, weekly: volume });
    }
  }
  return rows;
}
