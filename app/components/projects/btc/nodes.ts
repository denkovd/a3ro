/* ────────────────────────────────────────────────────────────────
   BTC Tracker — stock / supply geography nodes
   Venues are liquidity loci (not literal cold-storage pins).
   Mining shares are static published-style reference — update yearly.
   Client-safe: pure data, no backend imports.
──────────────────────────────────────────────────────────────── */

export type MiningLayerMode = "off" | "hashrate" | "share";

export type VenueKind = "exchange" | "etf" | "derivatives";
export type VenueStatus = "connecting" | "watchlist" | "reference";

export interface Venue {
  id: string;
  name: string;
  label: string;
  lon: number;
  lat: number;
  kind: VenueKind;
  glyph: "ring" | "diamond";
  zoom: number;
  status: VenueStatus;
  /** Honest panel copy — what will go live, not invented numbers. */
  title: string;
  note: string;
  /** Display rank for teaser / label declutter (1 = primary). */
  rank: number;
}

export interface MiningRegion {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** Approximate share of global hashrate, 0–1. */
  hashrateShare: number;
  /** Reference year for the share figure. */
  asOf: string;
}

export const MINING_SOURCE =
  "Published hashrate-share style reference · illustrative · update yearly";

/** Primary liquidity venues — pins = economic locus, not vault location. */
export const VENUES: Venue[] = [
  {
    id: "binance",
    name: "BINANCE",
    label: "BINANCE",
    lon: 103.85,
    lat: 1.29,
    kind: "exchange",
    glyph: "ring",
    zoom: 1.45,
    status: "connecting",
    title: "Binance · liquidity hub",
    note:
      "Major CEX liquidity locus (Singapore pin = operational hub, not reserve custody). Exchange reserve + netflow metrics connect when a free-tier feed is verified.",
    rank: 1,
  },
  {
    id: "coinbase",
    name: "COINBASE",
    label: "COINBASE",
    lon: -122.4,
    lat: 37.8,
    kind: "exchange",
    glyph: "ring",
    zoom: 1.4,
    status: "connecting",
    title: "Coinbase · US spot hub",
    note:
      "US spot and prime liquidity locus. Reserve / on-exchange stock and ETF-adjacent custody read when feeds land — never invent balances.",
    rank: 1,
  },
  {
    id: "etf_us",
    name: "US SPOT ETFS",
    label: "US ETF",
    lon: -74.0,
    lat: 40.7,
    kind: "etf",
    glyph: "diamond",
    zoom: 1.42,
    status: "watchlist",
    title: "US spot Bitcoin ETFs",
    note:
      "Institutional stock analogue (IBIT/FBTC-class aggregate). Holdings and daily creation/redemption flow — watchlist until free issuer/tracker feed is wired.",
    rank: 1,
  },
  {
    id: "okx",
    name: "OKX",
    label: "OKX",
    lon: 114.17,
    lat: 22.32,
    kind: "exchange",
    glyph: "ring",
    zoom: 1.35,
    status: "connecting",
    title: "OKX · Asia derivatives + spot",
    note:
      "Asia CEX locus. Netflow and open-interest context connect with public exchange metrics where available.",
    rank: 2,
  },
  {
    id: "bybit",
    name: "BYBIT",
    label: "BYBIT",
    lon: 55.27,
    lat: 25.2,
    kind: "exchange",
    glyph: "ring",
    zoom: 1.3,
    status: "watchlist",
    title: "Bybit · derivatives hub",
    note:
      "Perp-heavy liquidity locus. Funding / OI rails first; on-exchange reserve series when a verified free source exists.",
    rank: 2,
  },
  {
    id: "cme",
    name: "CME",
    label: "CME",
    lon: -87.63,
    lat: 41.88,
    kind: "derivatives",
    glyph: "ring",
    zoom: 1.28,
    status: "watchlist",
    title: "CME · BTC futures",
    note:
      "Institutional derivatives gate. Open interest and COT-style positioning — not spot custody. Watchlist until free series is verified.",
    rank: 2,
  },
  {
    id: "bitfinex",
    name: "BITFINEX",
    label: "BITFINEX",
    lon: 12.5,
    lat: 41.9,
    kind: "exchange",
    glyph: "ring",
    zoom: 1.25,
    status: "watchlist",
    title: "Bitfinex · Europe locus",
    note:
      "Historic large-reserve exchange locus (pin = HQ region). Reserve transparency varies — treat any live figure with source + lag labels.",
    rank: 3,
  },
];

/** Mining heartlands — share is static reference, not live telemetry. */
export const MINING_REGIONS: MiningRegion[] = [
  { id: "us", name: "US", lon: -101, lat: 36, hashrateShare: 0.38, asOf: "2024" },
  { id: "china", name: "CHINA", lon: 104, lat: 35, hashrateShare: 0.15, asOf: "2024" },
  { id: "kazakhstan", name: "KAZAKHSTAN", lon: 68, lat: 48, hashrateShare: 0.13, asOf: "2024" },
  { id: "russia", name: "RUSSIA", lon: 80, lat: 58, hashrateShare: 0.07, asOf: "2024" },
  { id: "canada", name: "CANADA", lon: -110, lat: 54, hashrateShare: 0.06, asOf: "2024" },
  { id: "malaysia", name: "MALAYSIA", lon: 102, lat: 4, hashrateShare: 0.04, asOf: "2024" },
  { id: "germany", name: "GERMANY", lon: 10, lat: 51, hashrateShare: 0.03, asOf: "2024" },
  { id: "ireland", name: "IRELAND", lon: -8, lat: 53, hashrateShare: 0.02, asOf: "2024" },
  { id: "paraguay", name: "PARAGUAY", lon: -58, lat: -23, hashrateShare: 0.02, asOf: "2024" },
  { id: "other", name: "ROW", lon: 25, lat: 0, hashrateShare: 0.1, asOf: "2024" },
];

/** Teaser-only primary marks (rank-1 venues). */
export const PRIMARY_VENUES = VENUES.filter((v) => v.rank === 1);
