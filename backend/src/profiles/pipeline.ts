/* ────────────────────────────────────────────────────────────────
   Asset profiles refresh — GitHub Actions job (profiles-refresh.yml).

   Two modes:
   - weekly  equities + ETFs from Finnhub: /stock/profile2,
             /stock/metric, and (equities) /stock/earnings.
             ~600 symbols × ≤3 calls, spaced for the 60 req/min free
             limit → ~30 min. --chunk lets it be split if needed.
   - daily   cheap, whole-market calls only:
             • Finnhub /calendar/earnings (one call, next 90 days)
               → next report date per equity
             • CoinGecko /coins/markets (one call per 250 coins)
               → crypto market cap, supply, volume, ATH

   Per-symbol failures are isolated and reported; nothing here ever
   writes a fabricated value (missing → null, failed earnings fetch
   keeps the previous quarters).
──────────────────────────────────────────────────────────────── */

import { fetchCalendarEarnings, fetchStockEarnings } from "../earnings/finnhub";
import { BULL_UNIVERSE } from "../bull/universe";
import { BullUniverseEntry } from "../bull/types";
import { Queryable } from "../storage/db";
import { setNextEarnings, upsertCryptoProfile, upsertEquityProfile } from "../storage/profileRepo";
import { COINGECKO_IDS } from "./coingeckoIds";
import {
  fetchCoinGeckoMarkets,
  fetchFinnhubMetrics,
  fetchFinnhubProfile,
  nextEarningsBySymbol,
  toEarningsQuarters,
  toFinnhubSymbol,
} from "./sources";

/** 60/min free tier → 1.1 s spacing keeps a safety margin. */
const FINNHUB_SPACING_MS = 1_100;

export interface ProfileRefreshReport {
  mode: "weekly" | "daily";
  attempted: number;
  written: number;
  empty: string[];
  failed: string[];
  nextEarningsWritten?: number;
  cryptoUnmatched?: string[];
}

export interface ProfileRefreshOptions {
  universe?: BullUniverseEntry[];
  log?: (msg: string) => void;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  today?: string;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Equity-like tiers that Finnhub covers. ETFs get profile + metrics, no earnings. */
export function profileTargets(universe: BullUniverseEntry[]): BullUniverseEntry[] {
  return universe.filter((e) => e.tier === "us_large" || e.tier === "ndx_extra" || e.tier === "etf");
}

export async function runWeeklyProfiles(
  db: Queryable,
  opts: ProfileRefreshOptions = {},
): Promise<ProfileRefreshReport> {
  const log = opts.log ?? (() => {});
  const sleep = opts.sleep ?? realSleep;
  const targets = profileTargets(opts.universe ?? BULL_UNIVERSE);
  const report: ProfileRefreshReport = { mode: "weekly", attempted: targets.length, written: 0, empty: [], failed: [] };

  let lastCall = 0;
  const gated = async <T>(fn: () => Promise<T>): Promise<T> => {
    const wait = lastCall + FINNHUB_SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  };

  for (const entry of targets) {
    const fh = toFinnhubSymbol(entry.symbol);
    try {
      const { profile, raw: rawProfile } = await gated(() => fetchFinnhubProfile(fh));
      const { metrics, raw: rawMetrics } = await gated(() => fetchFinnhubMetrics(fh));
      let earnings = null;
      if (entry.tier !== "etf") {
        try {
          earnings = toEarningsQuarters(await gated(() => fetchStockEarnings(fh)));
        } catch (e) {
          log(`  ~ ${entry.symbol}: earnings fetch failed (${e instanceof Error ? e.message : String(e)}) — keeping previous`);
        }
      }
      if (!profile && !metrics && (!earnings || earnings.length === 0)) {
        report.empty.push(entry.symbol);
        continue;
      }
      await upsertEquityProfile(db, entry.symbol, fh, profile, metrics, earnings, {
        profile2: rawProfile, metric: rawMetrics,
      });
      report.written++;
    } catch (e) {
      report.failed.push(entry.symbol);
      log(`✗ ${entry.symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return report;
}

export async function runDailyProfiles(
  db: Queryable,
  opts: ProfileRefreshOptions = {},
): Promise<ProfileRefreshReport> {
  const log = opts.log ?? (() => {});
  const universe = opts.universe ?? BULL_UNIVERSE;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const report: ProfileRefreshReport = {
    mode: "daily", attempted: 0, written: 0, empty: [], failed: [], cryptoUnmatched: [],
  };

  // 1) Next earnings dates — one whole-market call.
  try {
    const horizon = new Date(`${today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + 90);
    const rows = await fetchCalendarEarnings(today, horizon.toISOString().slice(0, 10));
    const byFinnhub = nextEarningsBySymbol(rows, today);
    const byScan = new Map<string, { date: string; hour: string | null }>();
    for (const e of profileTargets(universe)) {
      const n = byFinnhub.get(toFinnhubSymbol(e.symbol));
      if (n) byScan.set(e.symbol, n);
    }
    report.nextEarningsWritten = await setNextEarnings(db, byScan);
    log(`next earnings: ${byScan.size} upcoming in the universe, ${report.nextEarningsWritten} rows updated`);
  } catch (e) {
    report.failed.push("finnhub:calendar");
    log(`✗ earnings calendar: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) Crypto market data — CoinGecko.
  const coins = universe.filter((e) => COINGECKO_IDS[e.symbol]);
  report.attempted = coins.length;
  try {
    const markets = await fetchCoinGeckoMarkets(coins.map((e) => COINGECKO_IDS[e.symbol]));
    const byId = new Map(markets.map((m) => [m.id, m]));
    for (const e of coins) {
      const m = byId.get(COINGECKO_IDS[e.symbol]);
      if (!m) { report.cryptoUnmatched!.push(`${e.symbol}→${COINGECKO_IDS[e.symbol]}`); continue; }
      try {
        await upsertCryptoProfile(db, e.symbol, m);
        report.written++;
      } catch (err) {
        report.failed.push(e.symbol);
        log(`✗ ${e.symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (e) {
    report.failed.push("coingecko:markets");
    log(`✗ coingecko: ${e instanceof Error ? e.message : String(e)}`);
  }
  return report;
}
