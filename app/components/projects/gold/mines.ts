/* ────────────────────────────────────────────────────────────────
   Gold Tracker — mine production geography
   Static annual reference (USGS / WGC style). NOT live.
   Pins = producing heartlands, not capitals.
   Client-safe: pure data.
──────────────────────────────────────────────────────────────── */

export type MineLayerMode = "off" | "production" | "share";

export interface MineRegion {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** Approximate mine production, tonnes / year (reference). */
  productionT: number;
  /** Share of global mine supply, 0–1. */
  share: number;
  asOf: string;
}

export const MINES_SOURCE =
  "USGS MCS / WGC supply-style reference · annual · not live · update yearly";

/** Global mine supply ~3,000–3,600 t/y context; shares are approximate. */
export const MINE_REGIONS: MineRegion[] = [
  { id: "china", name: "CHINA", lon: 104, lat: 35, productionT: 370, share: 0.1, asOf: "2024" },
  { id: "australia", name: "AUSTRALIA", lon: 122, lat: -28, productionT: 310, share: 0.09, asOf: "2024" },
  { id: "russia", name: "RUSSIA", lon: 100, lat: 60, productionT: 320, share: 0.09, asOf: "2024" },
  { id: "canada", name: "CANADA", lon: -85, lat: 50, productionT: 200, share: 0.06, asOf: "2024" },
  { id: "us", name: "US", lon: -116, lat: 41, productionT: 170, share: 0.05, asOf: "2024" },
  { id: "ghana", name: "GHANA", lon: -1.5, lat: 6.5, productionT: 130, share: 0.04, asOf: "2024" },
  { id: "peru", name: "PERU", lon: -76, lat: -10, productionT: 100, share: 0.03, asOf: "2024" },
  { id: "indonesia", name: "INDONESIA", lon: 120, lat: -2, productionT: 110, share: 0.03, asOf: "2024" },
  { id: "uzbekistan", name: "UZBEKISTAN", lon: 64, lat: 41, productionT: 100, share: 0.03, asOf: "2024" },
  { id: "south_africa", name: "S. AFRICA", lon: 27, lat: -26, productionT: 100, share: 0.03, asOf: "2024" },
  { id: "mexico", name: "MEXICO", lon: -104, lat: 24, productionT: 120, share: 0.03, asOf: "2024" },
  { id: "brazil", name: "BRAZIL", lon: -52, lat: -12, productionT: 80, share: 0.02, asOf: "2024" },
];
