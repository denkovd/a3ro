/* ────────────────────────────────────────────────────────────────
   Gold Tracker — physical / paper flow geometry
   Hand-authored paths. Width tiers structural until ETF Δ or
   COMEX stocks drive intensity. Client-safe pure data.
──────────────────────────────────────────────────────────────── */

export type FlowTier = "major" | "medium" | "thin";

export type GoldLocusId =
  | "etf_us"
  | "comex"
  | "lbma"
  | "zurich"
  | "shanghai"
  | "dubai"
  | "cb_us"
  | "cb_china"
  | "cb_india"
  | "cb_euro"
  | "network";

export interface FlowRoute {
  id: string;
  name: string;
  tier: FlowTier;
  gates: GoldLocusId[];
  pts: [number, number][];
}

export const FLOW_ROUTES: FlowRoute[] = [
  {
    id: "etf_comex",
    name: "US ETF ↔ COMEX",
    tier: "major",
    gates: ["etf_us", "comex"],
    pts: [
      [-74.0, 40.7],
      [-78, 41.2],
      [-83, 41.6],
      [-87.63, 41.88],
    ],
  },
  {
    id: "london_zurich",
    name: "LONDON ↔ ZURICH",
    tier: "major",
    gates: ["lbma", "zurich"],
    pts: [
      [-0.12, 51.5],
      [2, 50],
      [5, 48.5],
      [8.54, 47.37],
    ],
  },
  {
    id: "london_us",
    name: "LONDON ↔ US",
    tier: "major",
    gates: ["lbma", "etf_us"],
    pts: [
      [-0.12, 51.5],
      [-20, 48],
      [-45, 45],
      [-65, 42],
      [-74, 40.7],
    ],
  },
  {
    id: "aus_asia",
    name: "AUS MINE → ASIA",
    tier: "medium",
    gates: ["shanghai"],
    pts: [
      [122, -28],
      [125, -10],
      [122, 10],
      [121.47, 31.23],
    ],
  },
  {
    id: "africa_swiss",
    name: "W. AFRICA → SWISS",
    tier: "medium",
    gates: ["zurich"],
    pts: [
      [-1.5, 6.5],
      [0, 15],
      [5, 30],
      [8, 40],
      [8.54, 47.37],
    ],
  },
  {
    id: "dubai_asia",
    name: "DUBAI ↔ ASIA",
    tier: "medium",
    gates: ["dubai", "shanghai"],
    pts: [
      [55.27, 25.2],
      [70, 22],
      [90, 24],
      [110, 28],
      [121.47, 31.23],
    ],
  },
  {
    id: "russia_china",
    name: "RUSSIA → CHINA",
    tier: "thin",
    gates: ["shanghai", "cb_china"],
    pts: [
      [100, 60],
      [105, 50],
      [112, 40],
      [116.4, 39.9],
    ],
  },
  {
    id: "india_dubai",
    name: "INDIA ↔ DUBAI",
    tier: "thin",
    gates: ["dubai", "cb_india"],
    pts: [
      [77.2, 28.6],
      [70, 26],
      [62, 25],
      [55.27, 25.2],
    ],
  },
  {
    id: "us_mine_comex",
    name: "US MINE → COMEX",
    tier: "thin",
    gates: ["comex"],
    pts: [
      [-116, 41],
      [-110, 41.5],
      [-100, 41.7],
      [-92, 41.8],
      [-87.63, 41.88],
    ],
  },
];

export const TERTIARY_PTS: [number, number][][] = [
  [
    [8.54, 47.37],
    [12, 46],
    [20, 42],
    [28, 38],
  ],
  [
    [-74, 40.7],
    [-60, 35],
    [-40, 30],
    [-20, 35],
    [-0.12, 51.5],
  ],
];
