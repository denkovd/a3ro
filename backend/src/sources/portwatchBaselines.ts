/* ────────────────────────────────────────────────────────────────
   IMF PortWatch chokepoint-gate BASELINE adapter — 1y/5y historical
   norms (mean/p10/p90) + year-over-year drift for the same six gates
   sources/portwatch.ts tracks daily. Sibling to portwatch.ts (same
   endpoint, same CHOKEPOINTS gate list, imported from there), but a
   different query shape: instead of per-gate row fetches, this uses
   the FeatureServer's server-side STATISTICS support to get grouped
   aggregates in three requests total (not six-per-window) — server-
   side percentile_cont statistics + groupByFieldsForStatistics let one
   query return one row per gate for a whole multi-year window.

   Endpoint (same service as portwatch.ts, live-verified 2026-07-05):
     GET https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query
   Live-verified layer capabilities (2026-07-05 metadata probe):
     supportsStatistics: true, supportsPercentileStatistics: true
     (statisticType "percentile_cont" + statisticParameters {"value": N}),
     groupByFieldsForStatistics for grouped aggregates, SQL expressions
     in `where` (DATE 'YYYY-MM-DD' literals — `date` is
     esriFieldTypeDateOnly, UTC), f=json. maxRecordCount (1000) doesn't
     apply to statistics responses (one row per group, not per record).

   THREE-QUERY DESIGN:
     Q1 (1y):    where >= from1y                      → avg+p10+p90, both metrics
     Q2 (5y):    where >= from5y                       → avg+p10+p90, both metrics
     Q3 (prior): where >= priorFrom AND < priorTo       → avg only, both metrics
   Q3 is the trailing-prior-year window (365..730 days back) used
   solely to compute yoyPct on the 1y rows: yoy compares the current
   1y mean against Q3's mean, not against anything in Q1/Q2's own
   payload. All three run against the SAME gate list built from
   CHOKEPOINTS (portwatch.ts) — never hardcoded here.

   RESPONSE-SHAPE CAVEAT (read before "fixing" a parse error):
   A live statistics query could not be fired against this endpoint
   while building this adapter (tooling URL-length limit on the
   grouped/percentile query string), so the expected shape below is
   the documented ArcGIS REST standard for grouped statistics, NOT a
   live-observed payload:
     { "fields": [...],
       "features": [
         { "attributes": { "portid": "chokepoint6",
             "avg_transits": 23.4, "avg_volume": 2810000.5,
             "p10_transits": 11, "p90_transits": 34,
             "p10_volume": 900000, "p90_volume": 4100000 } },
         ... one per portid ...
       ] }
   FAIL-LOUD CONTRACT: because this shape is unverified against a live
   response, any mismatch (features missing/not an array, or an
   attributes bag missing/mistyped in a way that breaks parsing) MUST
   throw a SourceError("bad_payload") that includes a ~200-char
   snippet of the raw response, so the first local ingest run surfaces
   a shape drift immediately instead of silently producing zero rows.
   Do not soften this into a skip — skipping is reserved for KNOWN,
   documented gaps (unknown portid, null avg for one gate/window).

   Refresh expectation: this endpoint is called by runBaselineCycle
   (ingest/baselineCycle.ts) roughly monthly, not on every cron tick —
   3 queries over years of history is heavier than portwatch.ts's
   daily per-gate polling, and 1y/5y norms don't meaningfully move
   day to day.
──────────────────────────────────────────────────────────────── */

import { CorridorId, CorridorBaseline, BaselineWindow } from "../core/corridorTypes";
import { getJsonForSource } from "./http";
import { tonsToMegatons } from "./portwatch";
import { CHOKEPOINTS } from "./portwatch";
import { SourceError } from "../core/types";

const SOURCE_ID = "portwatch-baselines";
const BASE_URL =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query";

const DAY_MS = 86_400_000;

/* ── date helpers (UTC, YYYY-MM-DD strings) ─────────────────────── */

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function minusDays(d: Date, days: number): Date {
  return new Date(d.getTime() - days * DAY_MS);
}

interface DateWindow {
  to: string;
  from1y: string;
  from5y: string;
  priorFrom: string;
  priorTo: string;
}

function computeWindow(now: Date): DateWindow {
  const to = toYmd(now);
  const from1y = toYmd(minusDays(now, 365));
  const from5y = toYmd(minusDays(now, 5 * 365));
  const priorFrom = toYmd(minusDays(now, 730));
  const priorTo = from1y;
  return { to, from1y, from5y, priorFrom, priorTo };
}

/* ── outStatistics builders ──────────────────────────────────────── */

interface OutStatistic {
  statisticType: string;
  onStatisticField: string;
  outStatisticFieldName: string;
  statisticParameters?: { value: number };
}

const FULL_STATS: OutStatistic[] = [
  { statisticType: "avg", onStatisticField: "n_tanker", outStatisticFieldName: "avg_transits" },
  { statisticType: "avg", onStatisticField: "capacity_tanker", outStatisticFieldName: "avg_volume" },
  {
    statisticType: "percentile_cont", onStatisticField: "n_tanker",
    outStatisticFieldName: "p10_transits", statisticParameters: { value: 0.1 },
  },
  {
    statisticType: "percentile_cont", onStatisticField: "n_tanker",
    outStatisticFieldName: "p90_transits", statisticParameters: { value: 0.9 },
  },
  {
    statisticType: "percentile_cont", onStatisticField: "capacity_tanker",
    outStatisticFieldName: "p10_volume", statisticParameters: { value: 0.1 },
  },
  {
    statisticType: "percentile_cont", onStatisticField: "capacity_tanker",
    outStatisticFieldName: "p90_volume", statisticParameters: { value: 0.9 },
  },
];

const AVG_ONLY_STATS: OutStatistic[] = [
  { statisticType: "avg", onStatisticField: "n_tanker", outStatisticFieldName: "avg_transits" },
  { statisticType: "avg", onStatisticField: "capacity_tanker", outStatisticFieldName: "avg_volume" },
];

function buildInList(): string {
  return CHOKEPOINTS.map((c) => `'${c.portid}'`).join(",");
}

function buildUrl(where: string, outStatistics: OutStatistic[]): string {
  const p = new URLSearchParams();
  p.set("where", where);
  p.set("groupByFieldsForStatistics", "portid");
  p.set("outStatistics", JSON.stringify(outStatistics));
  p.set("f", "json");
  return `${BASE_URL}?${p.toString()}`;
}

/* ── response shape ──────────────────────────────────────────────── */

interface StatsFeatureAttributes {
  portid?: unknown;
  avg_transits?: unknown;
  avg_volume?: unknown;
  p10_transits?: unknown;
  p90_transits?: unknown;
  p10_volume?: unknown;
  p90_volume?: unknown;
}

interface StatsFeature {
  attributes?: StatsFeatureAttributes;
}

interface StatsResponse {
  fields?: unknown[];
  features?: StatsFeature[];
  error?: { code?: number; message?: string };
}

/** Parsed per-gate stats row (fields absent on the prior-year/avg-only query). */
interface GateStats {
  avgTransits: number | null;
  avgVolume: number | null;
  p10Transits: number | null;
  p90Transits: number | null;
  p10Volume: number | null;
  p90Volume: number | null;
}

/** Coerce a possibly-string/null/undefined numeric attribute. Returns
 *  null for null/undefined/non-finite — callers skip on null, per spec
 *  ("null/absent avg → skip that gate/window (no row)"). */
function coerceNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchStats(where: string, outStatistics: OutStatistic[]): Promise<Map<string, GateStats>> {
  const url = buildUrl(where, outStatistics);
  const body = await getJsonForSource<StatsResponse>(SOURCE_ID, url);

  if (body.error) {
    const message = body.error.message ?? `code ${body.error.code ?? "?"}`;
    throw new SourceError(SOURCE_ID, "upstream_error", `PortWatch stats error body: ${message}`);
  }
  if (!Array.isArray(body.features)) {
    throw new SourceError(
      SOURCE_ID,
      "bad_payload",
      `unexpected PortWatch stats response shape: ${JSON.stringify(body).slice(0, 200)}`,
    );
  }

  const byPortid = new Map<string, GateStats>();
  for (const feature of body.features) {
    const attrs = feature.attributes;
    if (!attrs || typeof attrs !== "object") {
      throw new SourceError(
        SOURCE_ID,
        "bad_payload",
        `PortWatch stats feature missing attributes: ${JSON.stringify(body).slice(0, 200)}`,
      );
    }
    const portid = attrs.portid;
    if (typeof portid !== "string") {
      throw new SourceError(
        SOURCE_ID,
        "bad_payload",
        `PortWatch stats feature has non-string portid: ${JSON.stringify(body).slice(0, 200)}`,
      );
    }
    byPortid.set(portid, {
      avgTransits: coerceNum(attrs.avg_transits),
      avgVolume: coerceNum(attrs.avg_volume),
      p10Transits: coerceNum(attrs.p10_transits),
      p90Transits: coerceNum(attrs.p90_transits),
      p10Volume: coerceNum(attrs.p10_volume),
      p90Volume: coerceNum(attrs.p90_volume),
    });
  }
  return byPortid;
}

/* ── row building ─────────────────────────────────────────────────── */

function buildRowsForWindow(
  corridor: CorridorId,
  win: BaselineWindow,
  stats: GateStats,
  sampleFrom: string,
  sampleTo: string,
  yoy: { transits: number | null; volume: number | null },
  computedAt: string,
): CorridorBaseline[] {
  const rows: CorridorBaseline[] = [];

  if (stats.avgTransits !== null) {
    rows.push({
      corridor,
      metric: "tanker_transits",
      win,
      meanValue: stats.avgTransits,
      p10: stats.p10Transits,
      p90: stats.p90Transits,
      yoyPct: win === "1y" ? yoy.transits : null,
      sampleFrom,
      sampleTo,
      computedAt,
    });
  }

  if (stats.avgVolume !== null) {
    rows.push({
      corridor,
      metric: "tanker_volume",
      win,
      meanValue: tonsToMegatons(stats.avgVolume),
      p10: stats.p10Volume !== null ? tonsToMegatons(stats.p10Volume) : null,
      p90: stats.p90Volume !== null ? tonsToMegatons(stats.p90Volume) : null,
      yoyPct: win === "1y" ? yoy.volume : null,
      sampleFrom,
      sampleTo,
      computedAt,
    });
  }

  return rows;
}

function computeYoyPct(avg1y: number | null, avgPrior: number | null): number | null {
  if (avg1y === null || avgPrior === null || avgPrior <= 0) return null;
  const pct = ((avg1y - avgPrior) / avgPrior) * 100;
  return Math.round(pct * 10) / 10;
}

/* ── public entrypoint ────────────────────────────────────────────── */

export async function fetchGateBaselines(now: Date = new Date()): Promise<CorridorBaseline[]> {
  const w = computeWindow(now);
  const inList = buildInList();

  const [stats1y, stats5y, statsPrior] = await Promise.all([
    fetchStats(`portid IN (${inList}) AND date >= DATE '${w.from1y}'`, FULL_STATS),
    fetchStats(`portid IN (${inList}) AND date >= DATE '${w.from5y}'`, FULL_STATS),
    fetchStats(
      `portid IN (${inList}) AND date >= DATE '${w.priorFrom}' AND date < DATE '${w.priorTo}'`,
      AVG_ONLY_STATS,
    ),
  ]);

  const computedAt = now.toISOString();
  const rows: CorridorBaseline[] = [];

  for (const cfg of CHOKEPOINTS) {
    const s1 = stats1y.get(cfg.portid);
    const s5 = stats5y.get(cfg.portid);
    const sPrior = statsPrior.get(cfg.portid);

    if (s1) {
      // yoyPct is computed per metric: each row compares its own 1y
      // avg against that same metric's trailing-prior-year avg
      // (transits vs transits, volume vs volume) — never mixed.
      const yoy = {
        transits: computeYoyPct(s1.avgTransits, sPrior?.avgTransits ?? null),
        volume: computeYoyPct(s1.avgVolume, sPrior?.avgVolume ?? null),
      };
      rows.push(...buildRowsForWindow(cfg.corridor, "1y", s1, w.from1y, w.to, yoy, computedAt));
    }
    if (s5) {
      rows.push(
        ...buildRowsForWindow(cfg.corridor, "5y", s5, w.from5y, w.to, { transits: null, volume: null }, computedAt),
      );
    }
  }

  return rows;
}
