/* ────────────────────────────────────────────────────────────────
   EIA week-of-year SEASONAL baseline fetch — 5-year mean/min/max per
   ISO week for the WPSR stock series Tightness compares against.
   Sibling to portwatchBaselines.ts (independently-fetched multi-year
   aggregates, refreshed ~monthly by its own guarded cycle), and to
   eiaInventory.ts (same provider plumbing, same series ids — imported
   from there, never duplicated).

   One request per series (live-verified 2026-07-11): 5 years of a
   weekly series is ~262 rows, comfortably under one page —
     GET https://api.eia.gov/v2/{route}/data/
       ?api_key=…&frequency=weekly&data[]=value
       &facets[series][]={SERIES}
       &sort[0][column]=period&sort[0][direction]=asc
       &start={5y ago}&length=300
   Grouping is done here, client-side, by core/time's isoWeekOf —
   unlike PortWatch, EIA's API has no server-side statistics support.

   SPR is deliberately NOT in the seasonal set: SPR levels are
   policy-driven (release/refill programs), not seasonal, so a 5-year
   week band would be a fabricated norm. SPR renders as level + trend
   only. Utilization is also excluded for v1 — the Tightness
   utilization leg uses a fixed documented scale instead.

   Weeks with fewer than MIN_SAMPLES observations (week 53 exists in
   only ~1-2 of any 5 years) are dropped rather than emitted as thin
   bands; readers fall back to week 52 (see scores/engine.ts).
──────────────────────────────────────────────────────────────── */

import { SourceError, SourceErrorKind } from "../core/types";
import { isoWeekOf } from "../core/time";
import { SeasonalBaseline } from "../core/seasonalTypes";
import { INVENTORY_SERIES } from "./eiaInventory";

const BASE_URL = "https://api.eia.gov/v2/";
const LOOKBACK_YEARS = 5;
const MAX_ROWS = 300; // ≥ 5y of weekly rows (~262), one page
const MIN_SAMPLES = 3; // drop thin week bands (week 53)
const SOURCE_ID = "eia-seasonal";

/** The WPSR metrics that get a week-of-year band (see header). */
export const SEASONAL_METRICS = [
  "us_crude_stocks",
  "cushing_stocks",
  "gasoline_stocks",
  "distillate_stocks",
] as const;

interface EiaRow {
  period: string;
  series?: string;
  value: number | string | null;
}

interface EiaResponse {
  response?: { data: EiaRow[] };
  error?: string;
  data?: { error?: string };
}

function fail(kind: SourceErrorKind, message: string): never {
  throw new SourceError(SOURCE_ID, kind, message);
}

function textToKind(text: string): SourceErrorKind {
  const t = text.toLowerCase();
  if (/(exceed|throttl|too many|suspend|rate)/.test(t)) return "rate_limited";
  if (/(api.?key|invalid|unauthor|registered)/.test(t)) return "auth";
  return "upstream_error";
}

function buildUrl(apiKey: string, route: string, seriesId: string, now: Date): string {
  const start = new Date(now.getTime());
  start.setUTCFullYear(start.getUTCFullYear() - LOOKBACK_YEARS);
  const p = new URLSearchParams();
  p.set("api_key", apiKey);
  p.set("frequency", "weekly");
  p.append("data[]", "value");
  p.append("facets[series][]", seriesId);
  p.set("sort[0][column]", "period");
  p.set("sort[0][direction]", "asc");
  p.set("length", String(MAX_ROWS));
  p.set("start", start.toISOString().slice(0, 10));
  return `${BASE_URL}${route}/data/?${p.toString()}`;
}

async function fetchSeries(apiKey: string, route: string, seriesId: string, now: Date): Promise<EiaRow[]> {
  const url = buildUrl(apiKey, route, seriesId, now);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    fail(res.status === 403 ? textToKind(text) : "upstream_error", `HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as EiaResponse;
  const inlineError = body.error ?? body.data?.error;
  if (inlineError) fail(textToKind(inlineError), `EIA error body: ${inlineError}`);
  if (!body.response || !Array.isArray(body.response.data)) {
    fail("bad_payload", `unexpected EIA response shape: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.response.data;
}

/** Pure grouping step — exported for fixture tests. Values arrive in
 *  the series' RAW unit (MBBL) and are converted by `toCanonical`. */
export function groupByIsoWeek(
  metric: string,
  rows: { period: string; value: number }[],
  computedAt: string,
): SeasonalBaseline[] {
  if (rows.length === 0) return [];
  const byWeek = new Map<number, number[]>();
  let sampleFrom = rows[0].period;
  let sampleTo = rows[0].period;
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.period)) {
      fail("bad_payload", `EIA period "${r.period}" is not a calendar date`);
    }
    if (r.period < sampleFrom) sampleFrom = r.period;
    if (r.period > sampleTo) sampleTo = r.period;
    const wk = isoWeekOf(r.period);
    const bucket = byWeek.get(wk);
    if (bucket) bucket.push(r.value);
    else byWeek.set(wk, [r.value]);
  }
  const out: SeasonalBaseline[] = [];
  for (const [isoWeek, values] of byWeek) {
    if (values.length < MIN_SAMPLES) continue; // thin band (week 53) — dropped
    out.push({
      metric,
      isoWeek,
      meanValue: values.reduce((a, b) => a + b, 0) / values.length,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
      sampleCount: values.length,
      sampleFrom,
      sampleTo,
      computedAt,
    });
  }
  out.sort((a, b) => a.isoWeek - b.isoWeek);
  return out;
}

/**
 * Fetch 5y of history for every seasonal metric and reduce to
 * week-of-year bands. Throws SourceError on any failure — the caller
 * (ingest/seasonalCycle.ts) owns isolation, same as baselineCycle.
 */
export async function fetchSeasonalBaselines(
  now: Date = new Date(),
  apiKey = process.env.EIA_API_KEY ?? "",
): Promise<SeasonalBaseline[]> {
  if (!apiKey) fail("auth", "EIA_API_KEY is not set");
  const computedAt = now.toISOString();
  const out: SeasonalBaseline[] = [];
  for (const metric of SEASONAL_METRICS) {
    const cfg = INVENTORY_SERIES.find((s) => s.metric === metric);
    if (!cfg) fail("bad_payload", `seasonal metric "${metric}" has no INVENTORY_SERIES entry`);
    const raw = await fetchSeries(apiKey, cfg.route, cfg.seriesId, now);
    const rows: { period: string; value: number }[] = [];
    for (const r of raw) {
      if (r.series !== undefined && r.series !== cfg.seriesId) continue;
      if (r.value === null || r.value === undefined || r.value === "") continue; // gap rows
      const n = typeof r.value === "number" ? r.value : Number(r.value);
      if (!Number.isFinite(n)) continue;
      rows.push({ period: r.period, value: cfg.toCanonical(n) });
    }
    out.push(...groupByIsoWeek(metric, rows, computedAt));
  }
  return out;
}
