/* ────────────────────────────────────────────────────────────────
   Copper Tracker — reference data (roadmap #56)

   Hand-kept figures, each with its source and the date it was
   checked. Live data comes from the ABS (Australia's copper exports)
   and CME (COMEX warehouse stocks) through /api/copper/*.

   Units: kt = thousand tonnes of copper content (USGS).
   Positions of mines and plants are approximate.
──────────────────────────────────────────────────────────────── */
import type { AbsExportSpec, Destination } from "../commodity/absExports";

export type SourceId = "usgs" | "icsg" | "req" | "abs" | "cme" | "grasberg" | "mountIsa" | "cobrePanama";

export interface Source { label: string; url: string; reviewed: string; note?: string }

export const SOURCES: Record<SourceId, Source> = {
  abs: {
    label: "ABS: International Merchandise Trade, exports by commodity (SITC 283 copper ores, 682 copper)",
    url: "https://www.abs.gov.au/statistics/economy/international-trade/international-merchandise-trade-australia/latest-release",
    reviewed: "2026-11-27",
  },
  cme: {
    label: "CME Group: COMEX copper warehouse stocks (daily report)",
    url: "https://www.cmegroup.com/delivery_reports/Copper_Stocks.xls",
    reviewed: "2026-11-27",
  },
  usgs: {
    label: "USGS Mineral Commodity Summaries 2026: Copper",
    url: "https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-copper.pdf",
    reviewed: "2026-11-27",
    note: "Copper content; 2025 figures are USGS estimates",
  },
  icsg: {
    label: "International Copper Study Group: World Copper Factbook 2025",
    url: "https://icsg.org/copper-factbook/",
    reviewed: "2026-11-27",
  },
  req: {
    label: "Department of Industry: Resources and Energy Quarterly, September 2026",
    url: "https://www.industry.gov.au/publications/resources-and-energy-quarterly-september-2026",
    reviewed: "2026-11-27",
  },
  grasberg: {
    label: "Mining.com: Freeport delays Grasberg full restart to early 2028",
    url: "https://www.mining.com/freeport-delays-grasberg-full-restart-to-early-2028/",
    reviewed: "2026-11-27",
  },
  mountIsa: {
    label: "S&P Global: Queensland miners push for rail upgrade amid copper smelter closure risk",
    url: "https://www.spglobal.com/energy/en/news-research/latest-news/metals/040926-queensland-miners-push-for-rail-upgrade-amid-copper-smelter-closure-risk",
    reviewed: "2026-11-27",
  },
  cobrePanama: {
    label: "Reuters via Engineering News: Panama commission to recommend Cobre Panamá restart",
    url: "https://engineeringnews.co.za/article/panama-government-to-recommend-copper-mine-restart-through-state-tie-up-sources-say-2026-09-30",
    reviewed: "2026-11-27",
  },
};

/* ── mine and refinery output: USGS ── */

export const PRODUCTION_YEAR = 2025;
export const WORLD_MINE_KT = 23000;
export const WORLD_REFINED_KT = 29000;

export interface Country {
  id: string;
  name: string;
  /** Where the mining bubble sits. */
  lon: number;
  lat: number;
  /** Where the refining bubble sits, when it differs (smelters are often far from mines). */
  rlon?: number;
  rlat?: number;
  mine2025: number | null;
  mine2024: number | null;
  refined2025: number | null;
  refined2024: number | null;
}

export const COUNTRIES: readonly Country[] = [
  { id: "chile", name: "Chile", lon: -69.5, lat: -24, rlon: -70.6, rlat: -27.5, mine2025: 5300, mine2024: 5510, refined2025: 1700, refined2024: 1940 },
  { id: "drc", name: "DR Congo", lon: 26, lat: -10.5, rlon: 27.5, rlat: -11.8, mine2025: 3200, mine2024: 2990, refined2025: 2800, refined2024: 2560 },
  { id: "peru", name: "Peru", lon: -73, lat: -14, rlon: -76.5, rlat: -12, mine2025: 2700, mine2024: 2740, refined2025: 340, refined2024: 385 },
  { id: "china", name: "China", lon: 102, lat: 30, rlon: 118, rlat: 30, mine2025: 1800, mine2024: 1840, refined2025: 14000, refined2024: 12400 },
  { id: "russia", name: "Russia", lon: 60, lat: 58, rlon: 88.2, rlat: 69.3, mine2025: 1300, mine2024: 1020, refined2025: 950, refined2024: 896 },
  { id: "united-states", name: "United States", lon: -110, lat: 34, rlon: -112, rlat: 40.5, mine2025: 1000, mine2024: 1050, refined2025: 850, refined2024: 921 },
  { id: "zambia", name: "Zambia", lon: 27.5, lat: -13, rlon: 28.2, rlat: -12.6, mine2025: 940, mine2024: 823, refined2025: 270, refined2024: 189 },
  { id: "australia", name: "Australia", lon: 136.5, lat: -28, rlon: 146.8, rlat: -19.3, mine2025: 730, mine2024: 765, refined2025: 460, refined2024: 434 },
  { id: "indonesia", name: "Indonesia", lon: 137, lat: -4.2, rlon: 112.6, rlat: -7.2, mine2025: 710, mine2024: 1010, refined2025: 400, refined2024: 349 },
  { id: "kazakhstan", name: "Kazakhstan", lon: 70, lat: 48, rlon: 74.98, rlat: 46.85, mine2025: 710, mine2024: 724, refined2025: 500, refined2024: 498 },
  { id: "mexico", name: "Mexico", lon: -110, lat: 30, rlon: -109.9, rlat: 27.5, mine2025: 690, mine2024: 717, refined2025: 480, refined2024: 489 },
  { id: "canada", name: "Canada", lon: -122, lat: 51, rlon: -79, rlat: 48.2, mine2025: 500, mine2024: 515, refined2025: 320, refined2024: 324 },
  { id: "poland", name: "Poland", lon: 16.2, lat: 51.4, mine2025: 410, mine2024: 400, refined2025: 560, refined2024: 589 },
  { id: "japan", name: "Japan", lon: 136, lat: 35, mine2025: null, mine2024: null, refined2025: 1400, refined2024: 1570 },
  { id: "india", name: "India", lon: 72.5, lat: 22.5, mine2025: 23, mine2024: 27, refined2025: 620, refined2024: 545 },
  { id: "south-korea", name: "South Korea", lon: 129.3, lat: 35.5, mine2025: null, mine2024: null, refined2025: 610, refined2024: 604 },
  { id: "germany", name: "Germany", lon: 10, lat: 53.5, mine2025: null, mine2024: null, refined2025: 610, refined2024: 597 },
];

/** Reserves, kt. Australia: USGS shows 100,000 kt, of which 27,000 kt are JORC-compliant reserves. */
export const RESERVES = { worldKt: 980000, chileKt: 180000, australiaKt: 100000, australiaJorcKt: 27000 };

/* ── demand: ICSG ── */

export const DEMAND = {
  year: 2024,
  worldRefinedUsageMt: 27.4,
  chinaShare: 0.58,
  source: "icsg" as SourceId,
};

/** US effects of the 2025 tariff threat, USGS. */
export const US_STOCKS = {
  yearEndKt2025: 450,
  yearEndKt2024: 123,
  refinedImportsKt2025: 1700,
  refinedImportsKt2024: 903,
  comexPriceUsdLb2025: 4.8,
  comexPriceUsdLb2024: 4.22,
};

/* ── Australia ── */

export const REQ_OUTLOOK = {
  points: [
    { year: "2025-26", audBn: 14 },
    { year: "2030-31", audBn: 19 },
  ],
  note: "Export earnings are forecast to grow in real terms as demand from electricity grids, data centres and electric vehicles rises.",
  source: "req" as SourceId,
};

/* ── mines and plants ── */

export interface Site {
  id: string;
  name: string;
  lon: number;
  lat: number;
  owner: string;
  country: string;
  kind: "mine" | "smelter";
  note?: string;
  source?: SourceId;
  /** A current disruption: shown as a red event card on the globe (#95) and in the rail's Disruptions list. */
  disruption?: { kicker: string; summary: string; stats: readonly { label: string; value: string }[] };
}

export const SITES: readonly Site[] = [
  { id: "escondida", name: "Escondida", lon: -69.07, lat: -24.27, owner: "BHP (57.5%), Rio Tinto (30%)", country: "chile", kind: "mine", note: "The world's largest copper mine." },
  { id: "collahuasi", name: "Collahuasi", lon: -68.65, lat: -20.98, owner: "Anglo American, Glencore", country: "chile", kind: "mine" },
  { id: "el-teniente", name: "El Teniente", lon: -70.35, lat: -34.09, owner: "Codelco", country: "chile", kind: "mine" },
  { id: "chuquicamata", name: "Chuquicamata", lon: -68.9, lat: -22.29, owner: "Codelco", country: "chile", kind: "mine" },
  { id: "los-pelambres", name: "Los Pelambres", lon: -70.49, lat: -31.72, owner: "Antofagasta", country: "chile", kind: "mine" },
  { id: "cerro-verde", name: "Cerro Verde", lon: -71.6, lat: -16.53, owner: "Freeport-McMoRan", country: "peru", kind: "mine" },
  { id: "antamina", name: "Antamina", lon: -77.05, lat: -9.54, owner: "BHP, Glencore, Teck, Mitsubishi", country: "peru", kind: "mine" },
  { id: "las-bambas", name: "Las Bambas", lon: -72.33, lat: -14.1, owner: "MMG", country: "peru", kind: "mine" },
  { id: "grasberg", name: "Grasberg", lon: 137.11, lat: -4.05, owner: "Freeport-McMoRan, Indonesian state (MIND ID)", country: "indonesia", kind: "mine",
    note: "A mud rush on 8 September 2025 killed seven workers and stopped the Block Cave, Grasberg's main underground mine. Freeport now expects full capacity in early 2028.", source: "grasberg",
    disruption: { kicker: "Mine halted", summary: "Mud rush Sept 2025; full capacity early 2028",
      stats: [{ label: "Since", value: "8 Sep 2025" }, { label: "Stopped", value: "Block Cave" }, { label: "Full output", value: "Early 2028" }] } },
  { id: "kamoa-kakula", name: "Kamoa-Kakula", lon: 25.85, lat: -10.77, owner: "Ivanhoe Mines, Zijin Mining", country: "drc", kind: "mine" },
  { id: "tenke", name: "Tenke Fungurume", lon: 26.1, lat: -10.6, owner: "CMOC", country: "drc", kind: "mine" },
  { id: "kansanshi", name: "Kansanshi", lon: 26.43, lat: -12.1, owner: "First Quantum", country: "zambia", kind: "mine" },
  { id: "cobre-panama", name: "Cobre Panamá", lon: -80.65, lat: 8.84, owner: "First Quantum", country: "panama", kind: "mine",
    note: "Idle since late 2023, when Panama's Supreme Court struck down its contract. Only stockpiled ore was being processed in 2026; in September 2026 a government commission was reported to recommend a restart through a state partnership.", source: "cobrePanama",
    disruption: { kicker: "Mine idle", summary: "Idle since late 2023; restart under discussion",
      stats: [{ label: "Idle since", value: "Late 2023" }, { label: "Why", value: "Contract struck down" }, { label: "Restart", value: "Under review" }] } },
  { id: "oyu-tolgoi", name: "Oyu Tolgoi", lon: 106.85, lat: 43.0, owner: "Rio Tinto, Mongolian government", country: "mongolia", kind: "mine" },
  { id: "morenci", name: "Morenci", lon: -109.35, lat: 33.08, owner: "Freeport-McMoRan", country: "united-states", kind: "mine" },
  { id: "bingham", name: "Bingham Canyon", lon: -112.15, lat: 40.52, owner: "Rio Tinto (Kennecott)", country: "united-states", kind: "mine" },
  { id: "norilsk", name: "Norilsk", lon: 88.2, lat: 69.35, owner: "Nornickel", country: "russia", kind: "mine" },
  { id: "olympic-dam", name: "Olympic Dam", lon: 136.88, lat: -30.44, owner: "BHP", country: "australia", kind: "mine", note: "Mine, smelter and refinery in one place, so it ships refined copper cathode (plus uranium, gold and silver)." },
  { id: "prominent-hill", name: "Prominent Hill", lon: 135.57, lat: -29.72, owner: "BHP", country: "australia", kind: "mine" },
  { id: "carrapateena", name: "Carrapateena", lon: 137.48, lat: -31.2, owner: "BHP", country: "australia", kind: "mine" },
  { id: "ernest-henry", name: "Ernest Henry", lon: 140.71, lat: -20.44, owner: "Evolution Mining", country: "australia", kind: "mine" },
  { id: "cadia", name: "Cadia", lon: 148.99, lat: -33.47, owner: "Newmont", country: "australia", kind: "mine", note: "Gold and copper." },
  { id: "northparkes", name: "Northparkes", lon: 148.0, lat: -32.92, owner: "Evolution Mining (80%)", country: "australia", kind: "mine" },
  { id: "mount-isa", name: "Mount Isa smelter", lon: 139.49, lat: -20.73, owner: "Glencore", country: "australia", kind: "smelter",
    note: "Glencore's underground copper mines here closed in July 2025, so the smelter now runs on concentrate bought from other north-west Queensland mines. Governments put in A$600 million in October 2025 to keep it and the Townsville refinery running to the end of 2028.", source: "mountIsa",
    disruption: { kicker: "Mines closed", summary: "Mines closed 2025; smelter supported to end 2028",
      stats: [{ label: "Mines shut", value: "Jul 2025" }, { label: "Support", value: "A$600m" }, { label: "Runs to", value: "End 2028" }] } },
  { id: "townsville", name: "Townsville refinery", lon: 146.82, lat: -19.27, owner: "Glencore", country: "australia", kind: "smelter", note: "Refines Mount Isa's copper anode into cathode. Covered by the same support package to the end of 2028.", source: "mountIsa" },
];

/* ── ABS exports: SITC 283 + 682 ── */

/** Flows are drawn from Port Adelaide (Olympic Dam cathode, SA concentrate); Queensland ships from Townsville. */
export const FLOW_ORIGIN: [number, number] = [138.5, -34.8];
export const DESTINATIONS: readonly Destination[] = [
  { code: "CHIN", name: "China", lon: 121.5, lat: 31 },
  { code: "JAP", name: "Japan", lon: 135, lat: 34.6 },
  { code: "RKOR", name: "South Korea", lon: 129.3, lat: 35.5 },
  { code: "INIA", name: "India", lon: 72.6, lat: 22.8 },
  { code: "MLAY", name: "Malaysia", lon: 101.4, lat: 3 },
  { code: "USA", name: "United States", lon: -95, lat: 30 },
  { code: "INDO", name: "Indonesia", lon: 112.7, lat: -7.2 },
  { code: "THAI", name: "Thailand", lon: 100.9, lat: 13.1 },
];
export const COPPER_EXPORTS: AbsExportSpec = {
  id: "copper",
  sitc: [
    { code: "283", label: "Ores and concentrates" },
    { code: "682", label: "Refined and unwrought copper" },
  ],
  destinations: DESTINATIONS,
  states: [
    { code: "4", name: "South Australia" },
    { code: "3", name: "Queensland" },
    { code: "1", name: "New South Wales" },
    { code: "5", name: "Western Australia" },
  ],
};

/* ── companies ── */

export interface CopperCompany { name: string; tv: string; role: string; australian?: boolean; assetSlug?: string }

export const COMPANIES: readonly CopperCompany[] = [
  { name: "BHP", tv: "ASX:BHP", role: "Escondida (Chile), Olympic Dam, Prominent Hill and Carrapateena (South Australia)", australian: true, assetSlug: "asx-bhp" },
  { name: "Freeport-McMoRan", tv: "NYSE:FCX", role: "Grasberg (Indonesia), Cerro Verde (Peru), Morenci (US)" },
  { name: "Southern Copper", tv: "NYSE:SCCO", role: "Mines in Peru and Mexico" },
  { name: "Glencore", tv: "LSE:GLEN", role: "Collahuasi, Antamina, DR Congo assets; Mount Isa smelter and Townsville refinery" },
  { name: "Ivanhoe Mines", tv: "TSX:IVN", role: "Kamoa-Kakula (DR Congo)" },
  { name: "First Quantum", tv: "TSX:FM", role: "Kansanshi (Zambia); Cobre Panamá (idle since late 2023)" },
  { name: "Antofagasta", tv: "LSE:ANTO", role: "Los Pelambres and other Chilean mines" },
  { name: "Rio Tinto", tv: "ASX:RIO", role: "Oyu Tolgoi (Mongolia), Kennecott (US), 30% of Escondida", australian: true, assetSlug: "asx-rio" },
  { name: "Evolution Mining", tv: "ASX:EVN", role: "Ernest Henry (Queensland), Northparkes (NSW)", australian: true },
  { name: "Sandfire Resources", tv: "ASX:SFR", role: "MATSA (Spain), Motheo (Botswana)", australian: true },
];
