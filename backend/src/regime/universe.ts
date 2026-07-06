/* ────────────────────────────────────────────────────────────────
   Regime Shift Finder — curated cross-asset watchlist (30 symbols).
   A deliberate macro cross-section, not a whole-market screener:
   crypto majors, metals, energy, equity indices, FX, rates/credit,
   commodity-linked equities, ags. All symbols are Yahoo Finance
   tickers servable by the same free chart endpoint the oil module
   already uses. Editing this list is the ONLY step needed to change
   the universe — everything downstream is symbol-agnostic.
──────────────────────────────────────────────────────────────── */

import { UniverseEntry } from "./types";

export const REGIME_UNIVERSE: UniverseEntry[] = [
  // crypto majors — 24/7 bars, cleanest weekly closes (Sun 23:59 UTC)
  { symbol: "BTC-USD", displayName: "Bitcoin", assetClass: "crypto" },
  { symbol: "ETH-USD", displayName: "Ethereum", assetClass: "crypto" },
  { symbol: "SOL-USD", displayName: "Solana", assetClass: "crypto" },
  { symbol: "BNB-USD", displayName: "BNB", assetClass: "crypto" },
  { symbol: "XRP-USD", displayName: "XRP", assetClass: "crypto" },

  // metals
  { symbol: "GC=F", displayName: "Gold", assetClass: "metals" },
  { symbol: "SI=F", displayName: "Silver", assetClass: "metals" },
  { symbol: "HG=F", displayName: "Copper", assetClass: "metals" },
  { symbol: "PL=F", displayName: "Platinum", assetClass: "metals" },

  // energy
  { symbol: "CL=F", displayName: "WTI Crude", assetClass: "energy" },
  { symbol: "BZ=F", displayName: "Brent Crude", assetClass: "energy" },
  { symbol: "NG=F", displayName: "Natural Gas", assetClass: "energy" },

  // equity indices
  { symbol: "^GSPC", displayName: "S&P 500", assetClass: "index" },
  { symbol: "^NDX", displayName: "Nasdaq 100", assetClass: "index" },
  { symbol: "^DJI", displayName: "Dow Jones", assetClass: "index" },
  { symbol: "^RUT", displayName: "Russell 2000", assetClass: "index" },
  { symbol: "^GDAXI", displayName: "DAX", assetClass: "index" },
  { symbol: "^N225", displayName: "Nikkei 225", assetClass: "index" },
  { symbol: "^HSI", displayName: "Hang Seng", assetClass: "index" },

  // FX — trend of the PAIR (USDJPY bullish = dollar strength vs yen)
  { symbol: "DX-Y.NYB", displayName: "Dollar Index", assetClass: "fx" },
  { symbol: "EURUSD=X", displayName: "EUR/USD", assetClass: "fx" },
  { symbol: "USDJPY=X", displayName: "USD/JPY", assetClass: "fx" },
  { symbol: "GBPUSD=X", displayName: "GBP/USD", assetClass: "fx" },
  { symbol: "AUDUSD=X", displayName: "AUD/USD", assetClass: "fx" },

  // rates & credit (ETF proxies — price trend, i.e. inverse of yields)
  { symbol: "TLT", displayName: "20Y+ Treasuries", assetClass: "rates" },
  { symbol: "IEF", displayName: "7–10Y Treasuries", assetClass: "rates" },
  { symbol: "HYG", displayName: "High Yield Credit", assetClass: "rates" },

  // commodity-linked equities
  { symbol: "GDX", displayName: "Gold Miners", assetClass: "equity" },
  { symbol: "XLE", displayName: "Energy Sector", assetClass: "equity" },

  // ags
  { symbol: "ZW=F", displayName: "Wheat", assetClass: "ags" },
];
