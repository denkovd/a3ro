/* ────────────────────────────────────────────────────────────────
   FRED macro adapter — the shared macro-data layer that powers BOTH
   P·06 (the Darius-Dale-style growth × inflation regime) and the
   Macro Override score's "Macro pressure" half (docs/scores-plan.md
   #5). Built once, surfaced in both — see docs/roadmap.md.

   Keyless by design. The keyed FRED JSON API needs an api_key
   (`FRED_API_KEY` is empty in this project), but FRED also serves a
   public CSV endpoint that needs no key — the same keyless posture as
   the data.gov.sg MPA adapter:

     GET https://fred.stlouisfed.org/graph/fredgraph.csv?id={SERIES}&cosd={YYYY-MM-DD}
     → CSV:
         observation_date,{SERIES}
         2026-06-01,103.4
         2026-06-08,.
       (header line, then date,value rows; "." = missing/holiday.)

   `cosd` (start date) bounds the range so we don't pull decades of
   history each run. Endpoint + freshness live-probed 2026-07-11:
   T10Y2Y returned data current to 2026-07-10 (keyless, no auth).

   Series (all flagship, continuously-maintained — Fed/BLS/Treasury —
   not niche vendor series at discontinuation risk):
   - INDPRO       — Industrial Production Index (growth proxy, monthly)
   - CPIAUCSL     — CPI-U, SA (inflation, monthly)
   - DTWEXBGS     — Nominal Broad USD Index (dollar, daily)
   - T10Y2Y       — 10y–2y Treasury spread (curve, daily, %)
   - BAMLH0A0HYM2 — ICE BofA US High Yield OAS (credit, daily, %)
   - DGS10        — 10y Treasury yield (rates, daily, %)
   - T10YIE       — 10y breakeven inflation (forward inflation, daily, %)

   The engine (scores/macroEngine.ts) reads these as plain series; this
   module only fetches + parses. Any series returning zero usable rows
   throws bad_payload (fail loud — a silently-empty macro series would
   corrupt the regime), so a discontinued id can never pass unnoticed.
──────────────────────────────────────────────────────────────── */

import { SourceError, SourceErrorKind } from "../core/types";

const BASE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const SOURCE_ID = "fred-macro";

export type MacroAxis = "growth" | "inflation" | "dollar" | "curve" | "credit" | "rates" | "gold";

export interface FredSeriesConfig {
  seriesId: string;
  key: string; // canonical short name used across the engine + storage
  label: string;
  axis: MacroAxis;
  frequency: "monthly" | "daily";
  units: string;
}

/** The macro panel. Order is documentation only; each is fetched
 *  independently so one failure is isolated by the cycle. */
export const MACRO_SERIES: FredSeriesConfig[] = [
  { seriesId: "INDPRO", key: "growth_indpro", label: "Industrial Production", axis: "growth", frequency: "monthly", units: "index" },
  { seriesId: "CPIAUCSL", key: "inflation_cpi", label: "CPI (headline, SA)", axis: "inflation", frequency: "monthly", units: "index" },
  { seriesId: "DTWEXBGS", key: "dollar_broad", label: "Broad USD Index", axis: "dollar", frequency: "daily", units: "index" },
  { seriesId: "T10Y2Y", key: "curve_10y2y", label: "10y–2y spread", axis: "curve", frequency: "daily", units: "%" },
  { seriesId: "BAMLH0A0HYM2", key: "credit_hy_oas", label: "HY OAS", axis: "credit", frequency: "daily", units: "%" },
  { seriesId: "DGS10", key: "rates_10y", label: "10y Treasury yield", axis: "rates", frequency: "daily", units: "%" },
  { seriesId: "T10YIE", key: "inflation_breakeven", label: "10y breakeven", axis: "inflation", frequency: "daily", units: "%" },
];

export interface MacroObservation {
  date: string; // "YYYY-MM-DD"
  value: number;
}

export interface MacroSeries {
  seriesId: string;
  key: string;
  axis: MacroAxis;
  frequency: "monthly" | "daily";
  units: string;
  observations: MacroObservation[]; // ascending by date, missing rows dropped
}

function fail(kind: SourceErrorKind, message: string, cause?: unknown): never {
  throw new SourceError(SOURCE_ID, kind, message, cause ? { cause } : undefined);
}

/** ISO date `lookbackDays` before `now` — the `cosd` range bound. */
function startDate(now: Date, lookbackDays: number): string {
  return new Date(now.getTime() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Parse FRED's fredgraph CSV. Header line is `observation_date,{SERIES}`
 * (older exports say `DATE,VALUE`); every other line is `date,value`
 * with "." for a missing observation. Defensive: tolerates either
 * header, blank lines, and stray whitespace.
 */
export function parseFredCsv(csv: string): MacroObservation[] {
  const out: MacroObservation[] = [];
  const lines = csv.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const date = line.slice(0, comma).trim();
    const valueStr = line.slice(comma + 1).trim();
    // header row: first column isn't a calendar date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (valueStr === "." || valueStr === "") continue; // missing — skip, not an error
    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

/** Fetch + parse one FRED series over a bounded range. */
export async function fetchFredSeries(
  cfg: FredSeriesConfig,
  opts: { now?: Date; lookbackDays?: number; fetchImpl?: typeof fetch } = {},
): Promise<MacroSeries> {
  const now = opts.now ?? new Date();
  // Monthly series need years of history for a YoY + momentum read;
  // daily series need ~a year for trend/percentile context.
  const lookbackDays = opts.lookbackDays ?? (cfg.frequency === "monthly" ? 1400 : 420);
  const doFetch = opts.fetchImpl ?? fetch;

  const url = `${BASE_URL}?id=${encodeURIComponent(cfg.seriesId)}&cosd=${startDate(now, lookbackDays)}`;

  let res: Response;
  try {
    res = await doFetch(url);
  } catch (e) {
    fail("upstream_error", `FRED fetch failed for ${cfg.seriesId}: ${String(e)}`, e);
  }
  if (res.status === 429) fail("rate_limited", `FRED throttled ${cfg.seriesId} (429)`);
  if (!res.ok) fail("upstream_error", `FRED ${cfg.seriesId} HTTP ${res.status}`);

  const text = await res.text();
  // An invalid id returns an HTML error page, not CSV — guard on it.
  if (/<html/i.test(text)) fail("bad_payload", `FRED returned HTML (bad series id?) for ${cfg.seriesId}`);

  const observations = parseFredCsv(text);
  if (observations.length === 0) {
    fail("bad_payload", `FRED series ${cfg.seriesId} returned zero usable rows (discontinued or empty range)`);
  }
  observations.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    seriesId: cfg.seriesId,
    key: cfg.key,
    axis: cfg.axis,
    frequency: cfg.frequency,
    units: cfg.units,
    observations,
  };
}

/** Fetch the whole macro panel; per-series errors are the caller's to
 *  isolate (the macro cycle wraps each in its own try/catch). */
export async function fetchMacroPanel(
  opts: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<MacroSeries[]> {
  const out: MacroSeries[] = [];
  for (const cfg of MACRO_SERIES) {
    out.push(await fetchFredSeries(cfg, opts));
  }
  return out;
}
