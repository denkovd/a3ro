/* ────────────────────────────────────────────────────────────────
   BTC Tracker — liquidity corridor geometry
   Hand-authored illustration of major venue-to-venue liquidity
   paths. Width tiers are structural (not live netflow) until
   exchange flow metrics connect. Pulse activity defaults to 1.
   Client-safe: pure data.
──────────────────────────────────────────────────────────────── */

export type FlowTier = "major" | "medium" | "thin";

/** Locus ids that can appear as route gates (venue hotspots). */
export type BtcLocusId =
  | "binance"
  | "coinbase"
  | "okx"
  | "bybit"
  | "bitfinex"
  | "cme"
  | "etf_us"
  | "network";

export interface FlowRoute {
  id: string;
  name: string;
  tier: FlowTier;
  /** Venue/locus ids along the route (for future live intensity). */
  gates: BtcLocusId[];
  pts: [number, number][]; // [lon, lat]
}

export const FLOW_ROUTES: FlowRoute[] = [
  {
    id: "asia_us_spot",
    name: "ASIA CEX → US SPOT",
    tier: "major",
    gates: ["binance", "coinbase"],
    pts: [
      [103.85, 1.29],
      [140, 20],
      [170, 30],
      [-160, 35],
      [-140, 38],
      [-122.4, 37.8],
    ],
  },
  {
    id: "asia_us_etf",
    name: "ASIA → US ETF SPINE",
    tier: "major",
    gates: ["binance", "etf_us"],
    pts: [
      [103.85, 1.29],
      [90, 15],
      [60, 25],
      [20, 35],
      [-20, 40],
      [-50, 42],
      [-74, 40.7],
    ],
  },
  {
    id: "us_spot_etf",
    name: "COINBASE ↔ US ETF",
    tier: "medium",
    gates: ["coinbase", "etf_us"],
    pts: [
      [-122.4, 37.8],
      [-110, 40],
      [-95, 41],
      [-85, 41],
      [-74, 40.7],
    ],
  },
  {
    id: "asia_internal",
    name: "ASIA CEX BELT",
    tier: "medium",
    gates: ["binance", "okx"],
    pts: [
      [103.85, 1.29],
      [108, 8],
      [112, 18],
      [114.17, 22.32],
    ],
  },
  {
    id: "gulf_asia",
    name: "GULF DERIVS → ASIA",
    tier: "medium",
    gates: ["bybit", "binance"],
    pts: [
      [55.27, 25.2],
      [65, 18],
      [80, 10],
      [95, 5],
      [103.85, 1.29],
    ],
  },
  {
    id: "eu_us",
    name: "EUROPE ↔ US",
    tier: "thin",
    gates: ["bitfinex", "etf_us"],
    pts: [
      [12.5, 41.9],
      [0, 45],
      [-30, 44],
      [-55, 42],
      [-74, 40.7],
    ],
  },
  {
    id: "cme_etf",
    name: "CME ↔ ETF",
    tier: "thin",
    gates: ["cme", "etf_us"],
    pts: [
      [-87.63, 41.88],
      [-82, 41.5],
      [-78, 41],
      [-74, 40.7],
    ],
  },
  {
    id: "miner_us_sell",
    name: "US MINING → EXCHANGE",
    tier: "thin",
    gates: ["coinbase"],
    pts: [
      [-101, 36],
      [-108, 37],
      [-116, 37.5],
      [-122.4, 37.8],
    ],
  },
];

/** Decorative tertiary texture (no hit-test, always low alpha). */
export const TERTIARY_PTS: [number, number][][] = [
  [
    [55.27, 25.2],
    [40, 30],
    [20, 38],
    [12.5, 41.9],
  ],
  [
    [114.17, 22.32],
    [130, 30],
    [150, 40],
    [170, 45],
  ],
];
