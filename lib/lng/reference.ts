/* ────────────────────────────────────────────────────────────────
   LNG Tracker — reference data (roadmap #57)

   Hand-kept figures, each with its source and the date it was
   checked. Australia's monthly LNG export value comes live from the
   ABS through /api/lng/exports.

   Units: Mt = million tonnes of LNG; Mtpa = million tonnes a year of
   liquefaction capacity. Positions of plants are approximate.
──────────────────────────────────────────────────────────────── */
import type { AbsExportSpec, Destination } from "../commodity/absExports";

export type SourceId = "igu" | "abs" | "req" | "accr" | "nws" | "pluto" | "barossa" | "eia" | "iea" | "hormuz" | "pilbaraPorts";

export interface Source { label: string; url: string; reviewed: string; note?: string }

export const SOURCES: Record<SourceId, Source> = {
  abs: {
    label: "ABS: International Merchandise Trade, exports by commodity (SITC 343 natural gas)",
    url: "https://www.abs.gov.au/statistics/economy/international-trade/international-merchandise-trade-australia/latest-release",
    reviewed: "2026-11-27",
  },
  igu: {
    label: "International Gas Union: World LNG Report 2026 (reported by Reuters and TASS)",
    url: "https://igu.org/press-releases/world-lng-report-2026",
    reviewed: "2026-11-27",
    note: "2025 trade, exporters and importers",
  },
  req: {
    label: "Department of Industry: Resources and Energy Quarterly, September 2026",
    url: "https://www.industry.gov.au/news/australias-resources-and-energy-export-earnings-set-remain-high",
    reviewed: "2026-11-27",
  },
  accr: {
    label: "ACCR: Australia's operating LNG facilities (capacities and start-up years)",
    url: "https://www.accr.org.au/research/australias-lng-growth-wave-did-it-wash-for-shareholders/",
    reviewed: "2026-11-27",
  },
  nws: {
    label: "GIIGNL: Woodside retires second North West Shelf LNG train",
    url: "https://www.giignl.org/news/australias-woodside-retires-second-nws-lng-train",
    reviewed: "2026-11-27",
  },
  pluto: {
    label: "Woodside: Scarborough Energy Project and Pluto Train 2",
    url: "https://www.woodside.com/what-we-do/australian-growth-projects/scarborough",
    reviewed: "2026-11-27",
  },
  barossa: {
    label: "Santos: first Barossa LNG cargo from Darwin",
    url: "https://www.santos.com/news/santos-announces-first-barossa-lng-cargo/",
    reviewed: "2026-11-27",
  },
  eia: {
    label: "US EIA: Global LNG trade reached a record high in 2025 (July 2026)",
    url: "https://www.eia.gov/todayinenergy/detail.php?id=67864",
    reviewed: "2026-11-27",
  },
  iea: {
    label: "IEA: Gas Market Report, Q3 2026",
    url: "https://www.iea.org/reports/gas-market-report-q3-2026",
    reviewed: "2026-11-27",
  },
  hormuz: {
    label: "Bloomberg via BusinessMirror: Qatar boosting LNG exports as winter demand nears peak (26 Nov 2026)",
    url: "https://businessmirror.com.ph/2026/11/26/qatar-boosting-lng-exports-as-winter-demand-nears-peak/",
    reviewed: "2026-11-27",
  },
  pilbaraPorts: {
    label: "Pilbara Ports: 2025-26 throughput (reported by Daily Cargo News)",
    url: "https://www.thedcn.com.au/news/pilbara-ports-sets-world-record",
    reviewed: "2026-11-27",
  },
};

/* ── world trade: IGU, 2025 ── */

export const TRADE_YEAR = 2025;
export const WORLD_TRADE_MT = 437;
/** The three biggest exporters' share of world exports, 2025 (EIA). */
export const TOP3_SHARE = 0.63;

export interface Market { id: string; name: string; lon: number; lat: number; mt: number; note?: string }

export const EXPORTERS: readonly Market[] = [
  { id: "us", name: "United States", lon: -92, lat: 29.5, mt: 110.74, note: "The largest exporter since 2023; exports rose by 22 Mt in 2025 as new Gulf Coast plants started." },
  { id: "qatar", name: "Qatar", lon: 51.5, lat: 25.9, mt: 81.51, note: "Ras Laffan, the world's largest LNG export site. Its cargoes must pass through the Strait of Hormuz." },
  { id: "australia", name: "Australia", lon: 121, lat: -21, mt: 80.32, note: "Ten plants in WA, the NT and Queensland. 2025 output dipped a little after a North West Shelf train was retired." },
  { id: "russia", name: "Russia", lon: 72, lat: 69, mt: 30.52, note: "Mostly Yamal LNG in the Arctic and Sakhalin in the Pacific." },
  { id: "malaysia", name: "Malaysia", lon: 113, lat: 3.2, mt: 28.8, note: "Bintulu, Sarawak." },
];

export const IMPORTERS: readonly Market[] = [
  { id: "imp-europe", name: "Europe", lon: 8, lat: 50, mt: 126.2, note: "The fastest-growing buyer in 2025 (+26 Mt) as it replaced Russian pipeline gas." },
  { id: "imp-china", name: "China", lon: 119, lat: 30, mt: 69.77, note: "Still the largest single importer, but imports fell 8.9 Mt in 2025 as local output and Russian pipeline gas grew." },
  { id: "imp-japan", name: "Japan", lon: 138, lat: 36, mt: 67.37 },
  { id: "imp-korea", name: "South Korea", lon: 127.5, lat: 36.5, mt: 48.67 },
  { id: "imp-india", name: "India", lon: 73, lat: 20, mt: 24.6 },
];

/* ── 2026: the Middle East shock ── */

export const HORMUZ = {
  lon: 56.3,
  lat: 26.6,
  closedSince: "28 February 2026",
  /** Share of global LNG supply cut off by the closure (EIA). */
  supplyShare: 0.2,
  summary: "Shipping through the Strait of Hormuz has been closed or heavily restricted since 28 February 2026, cutting off about a fifth of the world's LNG supply from Qatar and the UAE. Qatar's Ras Laffan was damaged, which also delays its planned expansion.",
  latest: "By late November, Qatar's exports had climbed to their highest since the war began, with nine of Ras Laffan's 14 production units showing activity, but the strait was still restricted.",
  asOf: "26 Nov 2026",
  australia: "Australian LNG reaches Asia without passing through the strait, so its supply was not cut off.",
  sources: ["eia", "iea", "hormuz"] as SourceId[],
};

/* ── Australia ── */

export const OUTLOOK = {
  points: [
    { year: "2025-26", audBn: 57 },
    { year: "2026-27", audBn: 70 },
  ],
  note: "Higher prices from the Middle East disruption push earnings up. LNG prices rose above US$25 per MMBtu in September 2026; gold is forecast to overtake LNG as Australia's second-largest export.",
  source: "req" as SourceId,
};

export const PILBARA_LNG_MT = 26; // 2025-26, Pilbara Ports (Dampier and Ashburton)

export interface Plant {
  id: string;
  name: string;
  lon: number;
  lat: number;
  state: "WA" | "NT" | "Qld";
  operator: string;
  /** Nameplate capacity, Mtpa. */
  mtpa: number;
  startYear: number;
  feed: string;
  note?: string;
  source: SourceId;
}

export const PLANTS: readonly Plant[] = [
  { id: "nws", name: "North West Shelf (Karratha)", lon: 116.78, lat: -20.59, state: "WA", operator: "Woodside", mtpa: 14.3, startYear: 1989, feed: "Carnarvon Basin",
    note: "Australia's first LNG plant. Train 2 was retired in 2025 as its gas fields ran down, cutting capacity from 16.9 to 14.3 Mtpa.", source: "nws" },
  { id: "pluto", name: "Pluto", lon: 116.74, lat: -20.64, state: "WA", operator: "Woodside", mtpa: 4.9, startYear: 2012, feed: "Carnarvon Basin; Scarborough from 2026",
    note: "Pluto Train 2 (about 5 Mtpa) is being commissioned to process gas from the new Scarborough field, with the first cargo targeted for the fourth quarter of 2026.", source: "pluto" },
  { id: "gorgon", name: "Gorgon (Barrow Island)", lon: 115.45, lat: -20.79, state: "WA", operator: "Chevron", mtpa: 15.6, startYear: 2016, feed: "Carnarvon Basin", source: "accr" },
  { id: "wheatstone", name: "Wheatstone (Onslow)", lon: 115.03, lat: -21.67, state: "WA", operator: "Chevron", mtpa: 8.9, startYear: 2017, feed: "Carnarvon Basin", note: "Ships through the Port of Ashburton.", source: "accr" },
  { id: "prelude", name: "Prelude FLNG", lon: 123.31, lat: -13.79, state: "WA", operator: "Shell", mtpa: 3.6, startYear: 2019, feed: "Browse Basin", note: "A floating LNG plant moored offshore.", source: "accr" },
  { id: "ichthys", name: "Ichthys (Darwin)", lon: 130.93, lat: -12.53, state: "NT", operator: "Inpex", mtpa: 9.3, startYear: 2018, feed: "Browse Basin, by an 890 km pipeline", source: "accr" },
  { id: "darwin", name: "Darwin LNG", lon: 130.85, lat: -12.58, state: "NT", operator: "Santos", mtpa: 3.7, startYear: 2006, feed: "Barossa (Timor Sea)",
    note: "Idle from late 2023 when Bayu-Undan ran out; restarted on Barossa gas, with the first cargo leaving for Japan on 25 January 2026.", source: "barossa" },
  { id: "qclng", name: "Queensland Curtis LNG", lon: 151.16, lat: -23.74, state: "Qld", operator: "Shell", mtpa: 8.5, startYear: 2015, feed: "Coal seam gas (Surat and Bowen basins)", source: "accr" },
  { id: "aplng", name: "Australia Pacific LNG", lon: 151.22, lat: -23.79, state: "Qld", operator: "ConocoPhillips (plant), Origin (gas fields)", mtpa: 9.0, startYear: 2016, feed: "Coal seam gas (Surat and Bowen basins)", source: "accr" },
  { id: "glng", name: "Gladstone LNG", lon: 151.1, lat: -23.82, state: "Qld", operator: "Santos", mtpa: 7.8, startYear: 2016, feed: "Coal seam gas, plus gas bought from the east coast market", source: "accr" },
];

/* ── ABS exports: SITC 343 ── */

/** Flows are drawn from Karratha; LNG also ships from Onslow, Barrow Island, Darwin, Prelude and Gladstone. */
export const FLOW_ORIGIN: [number, number] = [116.78, -20.59];
export const DESTINATIONS: readonly Destination[] = [
  { code: "JAP", name: "Japan", lon: 137, lat: 35 },
  { code: "CHIN", name: "China", lon: 121.5, lat: 31 },
  { code: "RKOR", name: "South Korea", lon: 127, lat: 35.5 },
  { code: "TAIW", name: "Taiwan", lon: 120.3, lat: 22.6 },
  { code: "SING", name: "Singapore", lon: 103.8, lat: 1.3 },
  { code: "MLAY", name: "Malaysia", lon: 101.4, lat: 3 },
  { code: "THAI", name: "Thailand", lon: 100.9, lat: 12.7 },
  { code: "INIA", name: "India", lon: 72.8, lat: 21 },
];
export const LNG_EXPORTS: AbsExportSpec = {
  id: "lng",
  sitc: [{ code: "343", label: "Natural gas (almost all LNG)" }],
  destinations: DESTINATIONS,
  states: [
    { code: "5", name: "Western Australia" },
    { code: "3", name: "Queensland" },
    { code: "7", name: "Northern Territory" },
  ],
};

/* ── companies ── */

export interface LngCompany { name: string; tv: string; role: string; australian?: boolean; assetSlug?: string }

export const COMPANIES: readonly LngCompany[] = [
  { name: "Woodside Energy", tv: "ASX:WDS", role: "Operates North West Shelf and Pluto (with Scarborough and Pluto Train 2 starting); Louisiana LNG under construction", australian: true },
  { name: "Santos", tv: "ASX:STO", role: "Operates Gladstone LNG and Darwin LNG (Barossa); partner in PNG LNG", australian: true },
  { name: "Origin Energy", tv: "ASX:ORG", role: "Runs the gas fields for Australia Pacific LNG", australian: true },
  { name: "Inpex", tv: "TSE:1605", role: "Operates Ichthys (Darwin)" },
  { name: "Chevron", tv: "NYSE:CVX", role: "Operates Gorgon and Wheatstone" },
  { name: "Shell", tv: "LSE:SHEL", role: "Operates Queensland Curtis LNG and Prelude FLNG" },
  { name: "ConocoPhillips", tv: "NYSE:COP", role: "Operates the Australia Pacific LNG plant" },
  { name: "Cheniere Energy", tv: "NYSE:LNG", role: "The largest US exporter (Sabine Pass, Corpus Christi)" },
];
