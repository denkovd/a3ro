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

   Added for the liquidity/cost-of-capital refresh (docs/regime-macro-
   refresh.md) — the legs behind Dale's "is the global cost of capital
   too low" read:
   - VIXCLS       — CBOE VIX (equity vol, daily, index)
   - WALCL        — Fed total assets (weekly, $mn)
   - WTREGEN      — Treasury General Account (weekly, $mn)
   - RRPONTSYD    — Overnight reverse repo (daily, $bn)
   - GDP          — US nominal GDP, SAAR (quarterly, $bn)

   Added to complete Dale's SIX cycles — the panel previously split
   policy into monetary/fiscal and had no corporate profits cycle at
   all (docs/regime-macro-refresh.md §0):
   - DFF          — Fed funds effective (policy, daily, %)
   - MTSDS133FMS  — Federal surplus/deficit (policy·fiscal, monthly, $mn)
   - CP           — Corporate profits after tax (profits, quarterly, $bn)

   NOTE on Fed net liquidity: WALCL/WTREGEN are $millions, RRPONTSYD is
   $billions. netLiquiditySeries() in macro/engine.ts does the unit
   reconciliation — never subtract these raw.

   Deliberately NOT wired (probed 2026-07-25, see docs/regime-macro-
   refresh.md §3): the OECD IRLTLT01* international 10y yields (~4-month
   lag, no scheduled release) and THREEFYTP10 (~2-month lag). A lagging
   series cannot back a leading-indicator claim.

   The engine (scores/macroEngine.ts) reads these as plain series; this
   module only fetches + parses. Any series returning zero usable rows
   throws bad_payload (fail loud — a silently-empty macro series would
   corrupt the regime), so a discontinued id can never pass unnoticed.
──────────────────────────────────────────────────────────────── */

import { SourceError, SourceErrorKind } from "../core/types";

const BASE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const SOURCE_ID = "fred-macro";

export type MacroAxis =
  | "growth"
  | "inflation"
  | "dollar"
  | "curve"
  | "credit"
  | "rates"
  | "gold"
  | "vol"
  | "liquidity"
  | "nominal"
  | "policy"
  | "profits";

export interface FredSeriesConfig {
  seriesId: string;
  key: string; // canonical short name used across the engine + storage
  label: string;
  axis: MacroAxis;
  frequency: "monthly" | "daily" | "weekly" | "quarterly";
  units: string;
  /** Per-series range override. Only set it where the frequency default
   *  is wrong — e.g. GDP needs ~25y so its 2003–07 and 2015–19 trend
   *  means are computed from the same series rather than asserted. */
  lookbackDays?: number;
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

  // ── liquidity / cost-of-capital refresh ──
  { seriesId: "VIXCLS", key: "vol_equity", label: "VIX", axis: "vol", frequency: "daily", units: "index" },
  { seriesId: "WALCL", key: "fed_assets", label: "Fed total assets", axis: "liquidity", frequency: "weekly", units: "$mn" },
  { seriesId: "WTREGEN", key: "fed_tga", label: "Treasury General Account", axis: "liquidity", frequency: "weekly", units: "$mn" },
  { seriesId: "RRPONTSYD", key: "fed_rrp", label: "Overnight reverse repo", axis: "liquidity", frequency: "daily", units: "$bn" },
  // ~25y so the 2003–07 and 2015–19 trend means are computable in-series.
  { seriesId: "GDP", key: "nominal_gdp", label: "Nominal GDP (SAAR)", axis: "nominal", frequency: "quarterly", units: "$bn", lookbackDays: 9200 },

  // ── the six cycles: policy + corporate profits ──
  // Dale's six are growth, inflation, POLICY (monetary AND fiscal as
  // one cycle), CORPORATE PROFITS, liquidity, positioning. The page
  // previously split policy in two and omitted profits entirely.
  { seriesId: "DFF", key: "policy_rate", label: "Fed funds (effective)", axis: "policy", frequency: "daily", units: "%" },
  { seriesId: "MTSDS133FMS", key: "fiscal_balance", label: "Federal surplus/deficit", axis: "policy", frequency: "monthly", units: "$mn", lookbackDays: 1100 },
  { seriesId: "CP", key: "corporate_profits", label: "Corporate profits after tax", axis: "profits", frequency: "quarterly", units: "$bn", lookbackDays: 2200 },
];

export interface MacroObservation {
  date: string; // "YYYY-MM-DD"
  value: number;
}

export interface MacroSeries {
  seriesId: string;
  key: string;
  axis: MacroAxis;
  frequency: FredSeriesConfig["frequency"];
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
  // daily series need ~a year for trend/percentile context. A config
  // may override the default; an explicit opts value beats both.
  const lookbackDays =
    opts.lookbackDays ?? cfg.lookbackDays ?? (cfg.frequency === "monthly" ? 1400 : 420);
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

/** Series the panel cannot usefully be returned without: the GRID's
 *  two axes. A macro snapshot with no quadrant is not a degraded
 *  snapshot, it's an empty one — so these still fail loud. Everything
 *  else degrades the leg that needs it. */
export const REQUIRED_SERIES_KEYS = ["growth_indpro", "inflation_cpi"] as const;

export interface MacroPanelFailure {
  key: string;
  seriesId: string;
  error: string;
}

/**
 * Fetch the whole macro panel with PER-SERIES isolation.
 *
 * This used to be all-or-nothing: one dead series threw and the caller
 * wrote no macro snapshot at all. That was already fragile at seven
 * series; the liquidity/cost-of-capital refresh took the panel to
 * fifteen, which would have roughly doubled the daily probability of
 * losing the entire macro layer to one upstream hiccup — and the gold
 * cycle, which reuses this panel, with it.
 *
 * Now: a failed OPTIONAL series is recorded and skipped, so the leg
 * that depends on it reads pending while everything else still scores.
 * A failed REQUIRED series still throws, because the quadrant is the
 * one thing the page cannot be honest without.
 *
 * Failures are reported through `onSeriesError` rather than swallowed —
 * a silently-missing series is exactly the failure mode the original
 * fail-loud design existed to prevent.
 */
export async function fetchMacroPanel(
  opts: {
    now?: Date;
    fetchImpl?: typeof fetch;
    onSeriesError?: (failure: MacroPanelFailure) => void;
  } = {},
): Promise<MacroSeries[]> {
  const out: MacroSeries[] = [];
  for (const cfg of MACRO_SERIES) {
    try {
      out.push(await fetchFredSeries(cfg, opts));
    } catch (e) {
      if ((REQUIRED_SERIES_KEYS as readonly string[]).includes(cfg.key)) throw e;
      opts.onSeriesError?.({
        key: cfg.key,
        seriesId: cfg.seriesId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}
