/* ────────────────────────────────────────────────────────────────
   Route geometry is hand-authored illustration of canonical seaborne
   crude routes; widths follow EIA chokepoint volume estimates
   (H1'25); pulse activity follows live IMF PortWatch tanker data at
   the gates.

   Client-safe: the only backend import is a TYPE-ONLY import of
   CorridorId — pulling a value from "@a3ro/oil-backend" here would
   drag the pg-backed package into this bundle (same rule oilFormat/
   OilTrackerCore already follow for the corridor-metrics domain).

   The Russia → India · Suez route reflects post-2022 trade
   reorientation (published context, not live data).
──────────────────────────────────────────────────────────────── */
import type { CorridorId } from "@a3ro/oil-backend";

export type FlowTier = "major" | "medium" | "thin";

export interface FlowRoute {
  id: string;
  name: string; // e.g. "GULF → EAST ASIA"
  tier: FlowTier; // width class, from published EIA scale
  gates: CorridorId[]; // live PortWatch gates along the route
  pts: [number, number][]; // [lon, lat] waypoints
}

/* NOTE on antimeridian crossings: oilTrackerShared's bakeCorridor()
   converts every waypoint to a 3D unit vector via vec(lon, lat) and
   interpolates between consecutive waypoints with slerp() — spherical
   linear interpolation on the unit sphere. The arc it draws is the
   shortest great-circle path between two unit vectors; it never looks
   at the raw lon delta. So a waypoint chain that passes through ±180°
   longitude (as usgulf_asia_panama does below, via -165/-150 etc.) is
   safe as a single FlowRoute — no split at the antimeridian is needed. */
export const FLOW_ROUTES: FlowRoute[] = [
  {
    id: "gulf_east_asia",
    name: "GULF → EAST ASIA",
    tier: "major",
    gates: ["hormuz", "singapore"],
    pts: [
      [56.5, 26.6], [60, 23], [65, 17], [72, 10], [80, 6], [88, 5],
      [96, 4.5], [100.5, 3], [104.2, 1.2], [109, 6], [113, 13], [117, 21], [122, 29],
    ],
  },
  {
    id: "gulf_europe_suez",
    name: "GULF → EUROPE · SUEZ",
    tier: "medium",
    gates: ["hormuz", "bab_el_mandeb", "suez"],
    pts: [
      [56.5, 26.6], [58, 22], [52, 14], [43.4, 12.6], [41, 15], [38, 20], [34, 26],
      [32.4, 30], [28, 32], [20, 34.5], [10, 37], [0, 36.5], [-5.5, 36], [-9, 38],
      [-10, 44], [-5, 48.5], [4.3, 51.9],
    ],
  },
  {
    id: "gulf_europe_cape",
    name: "GULF → ATLANTIC · CAPE",
    tier: "medium",
    gates: ["cape"],
    pts: [
      [56.5, 26.6], [58, 20], [52, 8], [45, -4], [40, -16], [35, -26], [26, -34],
      [19, -35], [8, -30], [-2, -18], [-8, -4], [-12, 12], [-13, 26], [-11, 38],
      [-5, 46], [4.3, 51.9],
    ],
  },
  {
    id: "usgulf_europe",
    name: "US GULF → EUROPE",
    tier: "medium",
    gates: [],
    pts: [
      [-93.5, 27.5], [-88, 25.5], [-81, 24.5], [-75, 28], [-65, 33], [-50, 40],
      [-35, 45], [-20, 48], [-8, 49.5], [4.3, 51.9],
    ],
  },
  {
    id: "usgulf_asia_panama",
    name: "US GULF → ASIA · PANAMA",
    tier: "thin",
    gates: ["panama"],
    pts: [
      [-93.5, 27.5], [-88, 23], [-83, 15], [-79.5, 9], [-84, 4], [-100, 5],
      [-120, 10], [-140, 17], [-160, 24], [-180, 30], [-165, 33], [-150, 34],
    ],
  },
  {
    id: "cis_china",
    name: "CIS → CHINA",
    tier: "thin",
    gates: [],
    pts: [[132.9, 42.7], [131, 39], [127, 34], [124, 31], [122, 29]],
  },
  {
    id: "waf_europe",
    name: "W. AFRICA → EUROPE",
    tier: "thin",
    gates: [],
    pts: [
      [5, 3.5], [-2, 5], [-10, 10], [-14, 18], [-15, 27], [-13, 35], [-9, 42],
      [-4, 47], [4.3, 51.9],
    ],
  },
  {
    id: "russia_india_suez",
    name: "RUSSIA → INDIA · SUEZ",
    tier: "medium",
    gates: ["suez", "bab_el_mandeb"],
    pts: [
      [37.8, 44.6], [33, 42], [29, 41], [26, 39], [25, 36], [28, 33.5],
      [32.4, 30], [36, 24], [38, 20], [43.4, 12.6], [48, 11], [55, 10],
      [63, 13], [72.8, 18.9],
    ],
  },
  {
    id: "russia_baltic_asia",
    name: "RUSSIA BALTIC → ASIA · CAPE",
    tier: "thin",
    gates: ["cape"],
    pts: [
      [28.7, 60.3], [24, 58.5], [18, 56.5], [12.5, 56], [8, 57.5], [4, 58],
      [-2, 55], [-6, 50], [-11, 42], [-14, 30], [-12, 15], [-6, 0], [2, -15],
      [12, -28], [19, -35], [32, -30], [45, -18], [58, -5], [68, 8], [72.8, 18.9],
    ],
  },
  {
    id: "waf_china",
    name: "W. AFRICA → CHINA · CAPE",
    tier: "thin",
    gates: ["cape", "singapore"],
    pts: [
      [5, 3.5], [2, -6], [8, -18], [14, -28], [19, -35], [32, -30], [48, -18],
      [65, -8], [80, -2], [92, 0], [100.5, 3], [104.2, 1.2], [110, 7], [117, 20], [122, 29],
    ],
  },
  {
    id: "venezuela_asia",
    name: "VENEZUELA → ASIA · CAPE",
    tier: "thin",
    gates: ["cape", "singapore"],
    pts: [
      [-64.5, 10.5], [-55, 10], [-42, 3], [-28, -8], [-12, -20], [2, -30],
      [19, -35], [35, -27], [52, -12], [70, -3], [85, 0], [100.5, 3],
      [104.2, 1.2], [113, 13], [122, 29],
    ],
  },
  {
    id: "northsea_ara",
    name: "NORTH SEA → ARA",
    tier: "thin",
    gates: [],
    pts: [
      [1.5, 60.5], [2.2, 58], [3, 55], [3.8, 53.3], [4.3, 51.9],
    ],
  },
];

/** Published EIA chokepoint volume estimates (H1'25), Mb/d — static labeled context. */
export const GATE_EIA_EST_MBD: Partial<Record<CorridorId, number>> = {
  hormuz: 20.9,
  singapore: 23.2,
  suez: 4.9,
  bab_el_mandeb: 4.2,
  cape: 9.1,
  panama: 2.3,
};
