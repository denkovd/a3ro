/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — tiered universe builder.

   Tiers (UI tabs): macro (Module 4's 30-asset cross-section, reused
   verbatim) · us_large (S&P 500) · ndx_extra (NDX minus S&P) ·
   crypto · etf. First tier wins on duplicates, so BTC-USD stays
   macro and never re-appears under crypto.

   Symbol notation is Yahoo's everywhere (dots → dashes here);
   adapter chains are assigned per asset class, with per-symbol
   overrides for the futures (AV has WTI but no gold — the reason
   chains are per symbol, not global).
──────────────────────────────────────────────────────────────── */

import { REGIME_UNIVERSE } from "../regime/universe";
import { AdapterId, BullTier, BullUniverseEntry } from "./types";
import { CRYPTO, ETFS, NDX_EXTRA, SP500 } from "./universeData";

/** Dataset notation → Yahoo notation (BRK.B → BRK-B). */
export function toYahooSymbol(datasetSymbol: string): string {
  return datasetSymbol.replace(/\./g, "-");
}

const CHAIN_BY_CLASS: Record<BullUniverseEntry["assetClass"], AdapterId[]> = {
  equity: ["yahoo", "stooq"],
  etf: ["yahoo", "stooq"],
  index: ["yahoo", "stooq"],
  crypto: ["yahoo", "binance"],
  metals: ["yahoo"],
  energy: ["yahoo"],
  fx: ["yahoo"],
  rates: ["yahoo", "stooq"], // ETF proxies — Stooq serves them
  ags: ["yahoo"],
};

/** Futures config + per-symbol chain overrides for the macro tier. */
const FUTURES_OVERRIDES: Record<string, Pick<BullUniverseEntry, "futures" | "adapters" | "altSymbols">> = {
  "CL=F": {
    futures: { root: "CL", suffix: ".NYM", months: "FGHJKMNQUVXZ" }, // monthly
    adapters: ["yahoo", "alphavantage", "stooq"],
    altSymbols: { stooq: "cl.f" },
  },
  "GC=F": {
    futures: { root: "GC", suffix: ".CMX", months: "GJMQVZ" }, // Feb Apr Jun Aug Oct Dec
    adapters: ["yahoo", "stooq"], // AV has no gold endpoint
    altSymbols: { stooq: "gc.f" },
  },
};

export function buildBullUniverse(): BullUniverseEntry[] {
  const out: BullUniverseEntry[] = [];
  const seen = new Set<string>();

  const push = (e: BullUniverseEntry) => {
    if (seen.has(e.symbol)) return; // first tier wins
    seen.add(e.symbol);
    out.push(e);
  };

  // 1 · macro — Module 4's watchlist, verbatim, with futures overrides.
  for (const m of REGIME_UNIVERSE) {
    const override = FUTURES_OVERRIDES[m.symbol];
    push({
      symbol: m.symbol,
      displayName: m.displayName,
      tier: "macro",
      assetClass: m.assetClass,
      adapters: override?.adapters ?? CHAIN_BY_CLASS[m.assetClass],
      ...(override?.futures ? { futures: override.futures } : {}),
      ...(override?.altSymbols ? { altSymbols: override.altSymbols } : {}),
    });
  }

  // 2 · US large caps (S&P 500).
  for (const [sym, name] of SP500) {
    push({
      symbol: toYahooSymbol(sym), displayName: name,
      tier: "us_large", assetClass: "equity",
      adapters: CHAIN_BY_CLASS.equity,
    });
  }

  // 3 · NDX extras.
  for (const [sym, name] of NDX_EXTRA) {
    push({
      symbol: toYahooSymbol(sym), displayName: name,
      tier: "ndx_extra", assetClass: "equity",
      adapters: CHAIN_BY_CLASS.equity,
    });
  }

  // 4 · crypto.
  for (const [sym, name] of CRYPTO) {
    push({
      symbol: sym, displayName: name,
      tier: "crypto", assetClass: "crypto",
      adapters: CHAIN_BY_CLASS.crypto,
    });
  }

  // 5 · ETFs.
  for (const [sym, name] of ETFS) {
    push({
      symbol: sym, displayName: name,
      tier: "etf", assetClass: "etf",
      adapters: CHAIN_BY_CLASS.etf,
    });
  }

  return out;
}

/** Benchmark symbol for relative strength, by asset class.
 *  null = no natural benchmark (FX, rates, commodities). */
export function benchmarkFor(e: BullUniverseEntry): string | null {
  if (e.assetClass === "crypto") return e.symbol === "BTC-USD" ? null : "BTC-USD";
  if (e.assetClass === "equity" || e.assetClass === "etf" || e.assetClass === "index") {
    return e.symbol === "^GSPC" ? null : "^GSPC";
  }
  return null;
}

export const BULL_UNIVERSE = buildBullUniverse();
