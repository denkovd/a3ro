/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — data-source adapter layer.

   Common contract: every adapter normalizes into RegimeBar[]
   (oldest → newest, YYYY-MM-DD UTC dates); downstream code never
   sees a native payload, so swapping providers is a config change.

   Fallback orchestration (fetchBarsWithFallback):
   - Per-symbol adapter CHAIN from the universe entry — priority is
     per symbol, not global (AV has WTI but no gold; crypto prefers
     Binance as backup; etc).
   - The next adapter is tried only when the previous one throws OR
     returns stale/empty bars.
   - Every attempt is health-logged: which adapter served the symbol,
     why the primary was bypassed — the Yahoo-outage audit trail.
   - All adapters share one in-process rate gate (the scan is a
     single long-lived GitHub Actions process, so in-memory spacing
     is sufficient — unlike the serverless cron, which uses the
     DB-backed ingest/rateGate).

   Parsers are exported separately so fixture tests run without a
   network (sandbox precedent: regime/yahooHistory.ts).
──────────────────────────────────────────────────────────────── */

import { SourceError, SourceErrorKind } from "../core/types";
import { getJsonForSource } from "../sources/http";
import { parseYahooDaily } from "../regime/yahooHistory";
import {
  AdapterHealthEntry,
  AdapterId,
  BarRange,
  BarSourceAdapter,
  BullUniverseEntry,
  RegimeBar,
} from "./types";

/* ── in-process rate gate ─────────────────────────────────────── */

/** Self-imposed budgets (req/hour) per provider. Yahoo mirrors the
 *  oil module's 60/hr posture but scaled for a batch scan: 1 req/s
 *  spacing keeps 700 symbols ≈ 12 min — polite and far below any
 *  observed throttle. AV free tier is 25/DAY → tiny hourly cap so a
 *  broken chain can never burn the day's budget in one run. */
const MIN_SPACING_MS: Record<AdapterId, number> = {
  yahoo: 1_000,
  stooq: 1_500,
  binance: 500,
  alphavantage: 15_000,
};

const lastCallAt: Partial<Record<AdapterId, number>> = {};

async function gate(id: AdapterId): Promise<void> {
  const now = Date.now();
  const wait = (lastCallAt[id] ?? 0) + MIN_SPACING_MS[id] - now;
  lastCallAt[id] = Math.max(now, (lastCallAt[id] ?? 0) + MIN_SPACING_MS[id]);
  if (wait > 0) await sleep(wait);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── Yahoo (primary for everything) ───────────────────────────── */

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

function classifyYahoo(status: number, text: string): SourceErrorKind | undefined {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_error";
  if (status === 401 || status === 403) return "auth";
  if (/(throttl|rate|too many|exceed)/i.test(text)) return "rate_limited";
  return "bad_payload";
}

export const yahooAdapter: BarSourceAdapter = {
  id: "yahoo",
  async fetchDailyBars(symbol: string, range: BarRange): Promise<RegimeBar[]> {
    await gate("yahoo");
    const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const body = await getJsonForSource("bull-yahoo", url, {
      classifyHttpError: classifyYahoo,
    });
    return parseYahooDaily(body as never, symbol);
  },
};

/* ── Stooq (US equities/ETFs/indices fallback — keyless CSV) ──── */

/** Stooq CSV: `Date,Open,High,Low,Close,Volume` rows, oldest first.
 *  Exported for fixture tests. */
export function parseStooqCsv(csv: string, symbol: string): RegimeBar[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2 || !/^date,open,high,low,close/i.test(lines[0])) {
    throw new Error(`Stooq payload for ${symbol} is not a daily CSV`);
  }
  const bars: RegimeBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, open, high, low, close] = lines[i].split(",");
    const o = Number(open), h = Number(high), l = Number(low), c = Number(close);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) continue;
    if (![o, h, l, c].every(Number.isFinite)) continue;
    bars.push({ date, open: o, high: h, low: l, close: c });
  }
  return bars;
}

/** Yahoo symbol → Stooq symbol when no altSymbol is configured:
 *  plain US tickers get `.us`; ^GSPC → ^spx; dots become dashes. */
export function stooqSymbolFor(entry: BullUniverseEntry): string | null {
  const alt = entry.altSymbols?.stooq;
  if (alt) return alt;
  const s = entry.symbol;
  if (s === "^GSPC") return "^spx";
  if (s === "^NDX") return "^ndx";
  if (s === "^DJI") return "^dji";
  if (/^[A-Z.-]+$/.test(s) && !s.includes("=") && !s.startsWith("^")) {
    return `${s.replace(/\./g, "-").toLowerCase()}.us`;
  }
  return null; // futures/FX/crypto: not servable by default mapping
}

export function makeStooqAdapter(resolveSymbol: (symbol: string) => string | null): BarSourceAdapter {
  return {
    id: "stooq",
    async fetchDailyBars(symbol: string, range: BarRange): Promise<RegimeBar[]> {
      const stooqSym = resolveSymbol(symbol);
      if (!stooqSym) {
        throw new SourceError("bull-stooq", "no_data", `no Stooq mapping for ${symbol}`);
      }
      await gate("stooq");
      const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`;
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) {
        throw new SourceError("bull-stooq", res.status >= 500 ? "upstream_error" : "bad_payload",
          `HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const bars = parseStooqCsv(text, symbol);
      return range === "1mo" ? bars.slice(-31) : bars;
    },
  };
}

/* ── Binance (crypto fallback — keyless klines) ───────────────── */

/** BTC-USD → BTCUSDT unless an altSymbol overrides. */
export function binanceSymbolFor(entry: BullUniverseEntry): string | null {
  const alt = entry.altSymbols?.binance;
  if (alt) return alt;
  const m = entry.symbol.match(/^([A-Z0-9]+)-USD$/);
  return m ? `${m[1]}USDT` : null;
}

/** Binance klines: array of arrays; [0]=openTime ms, [1..4]=OHLC strings.
 *  Exported for fixture tests. */
export function parseBinanceKlines(payload: unknown, symbol: string): RegimeBar[] {
  if (!Array.isArray(payload)) {
    throw new Error(`Binance payload for ${symbol} is not an array`);
  }
  const bars: RegimeBar[] = [];
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const t = Number(row[0]);
    const o = Number(row[1]), h = Number(row[2]), l = Number(row[3]), c = Number(row[4]);
    if (![t, o, h, l, c].every(Number.isFinite)) continue;
    bars.push({ date: new Date(t).toISOString().slice(0, 10), open: o, high: h, low: l, close: c });
  }
  return bars;
}

export function makeBinanceAdapter(resolveSymbol: (symbol: string) => string | null): BarSourceAdapter {
  return {
    id: "binance",
    async fetchDailyBars(symbol: string, range: BarRange): Promise<RegimeBar[]> {
      const pair = resolveSymbol(symbol);
      if (!pair) {
        throw new SourceError("bull-binance", "no_data", `no Binance mapping for ${symbol}`);
      }
      await gate("binance");
      const limit = range === "1mo" ? 31 : 1000; // 1000 = Binance max (~2.7y; enough warm-up)
      const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=${limit}`;
      const body = await getJsonForSource("bull-binance", url);
      return parseBinanceKlines(body, symbol);
    },
  };
}

/* ── Alpha Vantage (equity/WTI fallback — 25 req/day free) ────── */

/** TIME_SERIES_DAILY payload → bars. Exported for fixture tests. */
export function parseAlphaVantageDaily(payload: unknown, symbol: string): RegimeBar[] {
  const p = payload as Record<string, unknown>;
  if (typeof p?.["Error Message"] === "string") {
    throw new SourceError("bull-alphavantage", "auth", String(p["Error Message"]));
  }
  if (typeof p?.Note === "string" || typeof p?.Information === "string") {
    throw new SourceError("bull-alphavantage", "rate_limited",
      String(p.Note ?? p.Information).slice(0, 200));
  }
  const series = p?.["Time Series (Daily)"] as Record<string, Record<string, string>> | undefined;
  if (!series) throw new Error(`AlphaVantage payload for ${symbol} missing daily series`);
  const bars: RegimeBar[] = [];
  for (const [date, row] of Object.entries(series)) {
    const o = Number(row["1. open"]), h = Number(row["2. high"]);
    const l = Number(row["3. low"]), c = Number(row["4. close"]);
    if (![o, h, l, c].every(Number.isFinite)) continue;
    bars.push({ date, open: o, high: h, low: l, close: c });
  }
  return bars.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function makeAlphaVantageAdapter(
  apiKey = process.env.ALPHAVANTAGE_API_KEY ?? "",
): BarSourceAdapter {
  return {
    id: "alphavantage",
    async fetchDailyBars(symbol: string, range: BarRange): Promise<RegimeBar[]> {
      if (!apiKey) throw new SourceError("bull-alphavantage", "auth", "ALPHAVANTAGE_API_KEY is not set");
      if (symbol.includes("=") || symbol.startsWith("^")) {
        // No AV endpoint for continuous futures or raw indices in this
        // adapter — per-symbol chains must route those elsewhere.
        throw new SourceError("bull-alphavantage", "no_data", `AV cannot serve ${symbol}`);
      }
      await gate("alphavantage");
      const outputsize = range === "1mo" ? "compact" : "full";
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol.replace(/-/g, "."))}&outputsize=${outputsize}&apikey=${apiKey}`;
      const body = await getJsonForSource("bull-alphavantage", url);
      return parseAlphaVantageDaily(body, symbol);
    },
  };
}

/* ── registry + fallback orchestration ────────────────────────── */

export interface AdapterRegistry {
  get(id: AdapterId): BarSourceAdapter;
}

export function defaultRegistry(universe: BullUniverseEntry[]): AdapterRegistry {
  const bySymbol = new Map(universe.map((e) => [e.symbol, e]));
  const resolveStooq = (s: string) => {
    const e = bySymbol.get(s);
    return e ? stooqSymbolFor(e) : null;
  };
  const resolveBinance = (s: string) => {
    const e = bySymbol.get(s);
    return e ? binanceSymbolFor(e) : null;
  };
  const adapters: Record<AdapterId, BarSourceAdapter> = {
    yahoo: yahooAdapter,
    stooq: makeStooqAdapter(resolveStooq),
    binance: makeBinanceAdapter(resolveBinance),
    alphavantage: makeAlphaVantageAdapter(),
  };
  return { get: (id) => adapters[id] };
}

/** Bars are stale when the newest bar is older than `maxAgeDays`
 *  calendar days before the run date (7 tolerates long weekends and
 *  single-source hiccups without flapping to fallbacks). */
export function isStale(bars: RegimeBar[], runDate: string, maxAgeDays = 7): boolean {
  if (bars.length === 0) return true;
  const newest = bars[bars.length - 1].date;
  const ageMs = Date.parse(`${runDate}T00:00:00Z`) - Date.parse(`${newest}T00:00:00Z`);
  return ageMs > maxAgeDays * 86_400_000;
}

export interface FallbackResult {
  bars: RegimeBar[] | null;
  health: AdapterHealthEntry;
}

/**
 * Walk the entry's adapter chain until one returns fresh bars.
 * Never throws: total failure returns bars=null with the reasons in
 * the health entry, so one symbol can never sink the run.
 */
export async function fetchBarsWithFallback(
  entry: BullUniverseEntry,
  range: BarRange,
  runDate: string,
  registry: AdapterRegistry,
): Promise<FallbackResult> {
  const reasons: string[] = [];
  for (const id of entry.adapters) {
    const started = Date.now();
    try {
      const bars = await registry.get(id).fetchDailyBars(entry.symbol, range);
      if (isStale(bars, runDate)) {
        reasons.push(`${id}: stale/empty (newest ${bars[bars.length - 1]?.date ?? "none"})`);
        continue;
      }
      return {
        bars,
        health: {
          runDate, symbol: entry.symbol, adapterUsed: id, ok: true,
          fallbackReason: reasons.length > 0 ? reasons.join(" | ") : null,
          latencyMs: Date.now() - started, error: null,
        },
      };
    } catch (e) {
      const msg = e instanceof SourceError ? `${e.kind}: ${e.message}` :
        e instanceof Error ? e.message : String(e);
      reasons.push(`${id}: ${msg.slice(0, 200)}`);
    }
  }
  return {
    bars: null,
    health: {
      runDate, symbol: entry.symbol, adapterUsed: null, ok: false,
      fallbackReason: null, latencyMs: null, error: reasons.join(" | ").slice(0, 500),
    },
  };
}
