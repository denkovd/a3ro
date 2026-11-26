/* ────────────────────────────────────────────────────────────────
   Iron Ore Tracker — reference data (roadmap #55)

   Hand-kept figures, each with its source and the date it was
   checked. Live data (Australia's monthly export value) comes from
   the ABS via /api/ironore/exports, not from this file.

   Units: Mt = million tonnes. Production is USGS "usable ore"
   (the ore as shipped, not its iron content).
   Positions of mines and ports are approximate.
──────────────────────────────────────────────────────────────── */
import type { AbsExportSpec, Destination } from "../commodity/absExports";

export type SourceId = "usgs" | "waProfile" | "pilbaraPorts" | "req" | "simandou" | "abs";

export interface Source { label: string; url: string; reviewed: string; note?: string }

export const SOURCES: Record<SourceId, Source> = {
  abs: {
    label: "ABS: International Merchandise Trade, exports by commodity (SITC 281 iron ore)",
    url: "https://www.abs.gov.au/statistics/economy/international-trade/international-merchandise-trade-australia/latest-release",
    reviewed: "2026-11-27",
    note: "Data API dataflow ABS,MERCH_EXP,1.1.0; original terms, A$ thousands",
  },
  usgs: {
    label: "USGS Mineral Commodity Summaries 2026: Iron ore",
    url: "https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-iron-ore.pdf",
    reviewed: "2026-11-27",
    note: "Usable ore; 2025 figures are USGS estimates",
  },
  waProfile: {
    label: "WA Government: Western Australia Iron Ore Profile, August 2026",
    url: "https://www.watc.wa.gov.au/media/uosczwiz/wa-iron-ore-profile-august-2026.pdf",
    reviewed: "2026-11-27",
  },
  pilbaraPorts: {
    label: "Pilbara Ports: 2025-26 throughput (reported by Daily Cargo News)",
    url: "https://www.thedcn.com.au/news/pilbara-ports-sets-world-record",
    reviewed: "2026-11-27",
  },
  req: {
    label: "Department of Industry: Resources and Energy Quarterly, September 2026",
    url: "https://www.industry.gov.au/publications/resources-and-energy-quarterly-september-2026",
    reviewed: "2026-11-27",
  },
  simandou: {
    label: "Rio Tinto: Simandou partners celebrate start of operations",
    url: "https://www.riotinto.com/en/news/releases/2025/simandou-partners-celebrate-start-of-operations",
    reviewed: "2026-11-27",
  },
};

/* ── producers: USGS usable ore ── */

export const PRODUCTION_YEAR = 2025;
/** USGS world total, rounded. */
export const WORLD_PRODUCTION_MT = 2600;

export interface Producer {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** Usable ore, Mt. 2025 is a USGS estimate. */
  mt2025: number;
  mt2024: number;
  /** 2024 itself is a USGS estimate for this country. */
  estimate2024?: boolean;
  /** Most of the ore stays at home for local steelmaking. */
  mostlyDomestic?: boolean;
}

export const PRODUCERS: readonly Producer[] = [
  { id: "australia", name: "Australia", lon: 121, lat: -24, mt2025: 980, mt2024: 982 },
  { id: "brazil", name: "Brazil", lon: -48, lat: -13, mt2025: 420, mt2024: 428 },
  { id: "india", name: "India", lon: 82, lat: 21, mt2025: 310, mt2024: 282, mostlyDomestic: true },
  { id: "china", name: "China", lon: 106, lat: 34, mt2025: 290, mt2024: 293, mostlyDomestic: true },
  { id: "iran", name: "Iran", lon: 55, lat: 32, mt2025: 93, mt2024: 90, estimate2024: true },
  { id: "russia", name: "Russia", lon: 40, lat: 52, mt2025: 86, mt2024: 91, estimate2024: true, mostlyDomestic: true },
  { id: "canada", name: "Canada", lon: -67, lat: 53, mt2025: 69, mt2024: 70 },
  { id: "south-africa", name: "South Africa", lon: 23, lat: -28, mt2025: 66, mt2024: 64, estimate2024: true },
  { id: "ukraine", name: "Ukraine", lon: 33.5, lat: 48, mt2025: 52, mt2024: 54.7 },
  { id: "united-states", name: "United States", lon: -92, lat: 47, mt2025: 38, mt2024: 45.1, mostlyDomestic: true },
  { id: "kazakhstan", name: "Kazakhstan", lon: 63, lat: 52, mt2025: 35, mt2024: 37 },
  { id: "sweden", name: "Sweden", lon: 20.5, lat: 67.5, mt2025: 26, mt2024: 25, estimate2024: true },
  { id: "peru", name: "Peru", lon: -75.5, lat: -15, mt2025: 21, mt2024: 19.8 },
  { id: "chile", name: "Chile", lon: -70.5, lat: -28.5, mt2025: 19, mt2024: 18, estimate2024: true },
  { id: "turkey", name: "Turkey", lon: 37, lat: 39, mt2025: 18, mt2024: 17, estimate2024: true },
  { id: "mauritania", name: "Mauritania", lon: -12, lat: 22.5, mt2025: 15, mt2024: 14.3 },
  { id: "mexico", name: "Mexico", lon: -103, lat: 19, mt2025: 7.7, mt2024: 7.8 },
];

/* ── trade and importers: WA Government profile (2025 calendar year) ── */

export const TRADE_YEAR = 2025;
export const WORLD_TRADE_MT = 1708;
export const WORLD_PRODUCTION_WA_MT = 2467; // the WA profile's own 2025 production total, for the trade share

export interface Importer { id: string; name: string; lon: number; lat: number; mt: number; share: number }

export const IMPORTERS: readonly Importer[] = [
  { id: "imp-china", name: "China", lon: 119, lat: 31, mt: 1244, share: 0.728 },
  { id: "imp-japan", name: "Japan", lon: 137, lat: 35.5, mt: 93, share: 0.054 },
  { id: "imp-korea", name: "South Korea", lon: 128, lat: 36, mt: 69, share: 0.04 },
];

/* ── Western Australia ── */

export const WA = {
  /** 2025-26 financial year, WA profile. */
  exportsMt: 936,
  exportsValueAudBn: 117.7,
  valueShares: [
    { name: "China", share: 0.857 },
    { name: "South Korea", share: 0.054 },
    { name: "Japan", share: 0.054 },
    { name: "Other", share: 0.035 },
  ],
  period: "2025-26",
  /** Latest monthly 62% Fe price quoted in the WA profile. */
  priceUsd: 96.3,
  priceMonth: "August 2026",
  priceForecast: "WA Government forecasts US$85.2 a tonne in 2026-27, then US$72.0 a year from 2027-28 to 2029-30.",
  source: "waProfile" as SourceId,
};

/** Department of Industry export earnings forecast, real A$ (base 2026-27). */
export const REQ_OUTLOOK = {
  points: [
    { year: "2026-27", audBn: 107 },
    { year: "2027-28", audBn: 96 },
    { year: "2030-31", audBn: 79 },
  ],
  note: "Prices are forecast to fall as global supply rises and demand weakens.",
  source: "req" as SourceId,
};

export const SIMANDOU = {
  capacityMt: 120,
  started: "November 2025",
  note: "High-grade ore (about 65% iron) from Guinea, ramping up over about 30 months. At full rate it adds roughly 7% to world seaborne trade, most of it bound for China.",
  source: "simandou" as SourceId,
};

/* ── ports ── */

export interface Port {
  id: string;
  name: string;
  lon: number;
  lat: number;
  operators: string;
  /** Total throughput, Mt, 2025-26 (all cargo), when published. */
  throughputMt: number | null;
  /** Iron ore exports, Mt, 2025-26, when published separately. */
  ironOreMt?: number;
  note?: string;
  source: SourceId;
}

export const PILBARA_IRON_ORE_MT = 759.4; // 2025-26, Port Hedland + Dampier + Ashburton
export const PORTS: readonly Port[] = [
  { id: "port-hedland", name: "Port Hedland", lon: 118.58, lat: -20.31, operators: "BHP, Fortescue, Roy Hill, Mineral Resources", throughputMt: 580.4, note: "The world's largest bulk export port by tonnage. Almost all of it is iron ore.", source: "pilbaraPorts" },
  { id: "dampier", name: "Dampier", lon: 116.71, lat: -20.66, operators: "Rio Tinto (Parker Point, East Intercourse Island)", throughputMt: 178.3, note: "Throughput includes LNG and salt as well as iron ore.", source: "pilbaraPorts" },
  { id: "cape-lambert", name: "Cape Lambert (Port Walcott)", lon: 117.19, lat: -20.59, operators: "Rio Tinto", throughputMt: null, note: "Rio Tinto's own port; not part of Pilbara Ports, so its tonnage isn't in the figures above.", source: "pilbaraPorts" },
  { id: "ashburton", name: "Ashburton (Onslow)", lon: 115.05, lat: -21.65, operators: "Mineral Resources (Onslow Iron), Chevron LNG", throughputMt: 45.2, ironOreMt: 30.8, note: "Iron ore exports through Onslow reached 30.8 Mt as Onslow Iron ramped up.", source: "waProfile" },
  { id: "cape-preston", name: "Cape Preston", lon: 116.2, lat: -20.84, operators: "CITIC Pacific Mining (Sino Iron)", throughputMt: null, note: "Exports magnetite concentrate.", source: "waProfile" },
];

/* ── mines ── */

export interface Mine { id: string; name: string; lon: number; lat: number; owner: string; country: string; note?: string }

export const MINES: readonly Mine[] = [
  { id: "whaleback", name: "Mount Whaleback (Newman)", lon: 119.67, lat: -23.36, owner: "BHP", country: "australia" },
  { id: "south-flank", name: "South Flank / Mining Area C", lon: 118.95, lat: -22.98, owner: "BHP", country: "australia", note: "Deterra Royalties earns a royalty on Mining Area C sales." },
  { id: "jimblebar", name: "Jimblebar", lon: 120.12, lat: -23.37, owner: "BHP", country: "australia" },
  { id: "tom-price", name: "Tom Price", lon: 117.79, lat: -22.69, owner: "Rio Tinto", country: "australia" },
  { id: "paraburdoo", name: "Paraburdoo", lon: 117.67, lat: -23.2, owner: "Rio Tinto", country: "australia" },
  { id: "gudai-darri", name: "Gudai-Darri", lon: 119.07, lat: -22.5, owner: "Rio Tinto", country: "australia" },
  { id: "cloudbreak", name: "Cloudbreak", lon: 119.43, lat: -22.31, owner: "Fortescue", country: "australia" },
  { id: "christmas-creek", name: "Christmas Creek", lon: 119.78, lat: -22.38, owner: "Fortescue", country: "australia" },
  { id: "solomon", name: "Solomon", lon: 117.95, lat: -22.15, owner: "Fortescue", country: "australia" },
  { id: "iron-bridge", name: "Iron Bridge", lon: 119.05, lat: -21.55, owner: "Fortescue", country: "australia", note: "Magnetite: low-grade ore upgraded to a high-grade concentrate on site." },
  { id: "roy-hill", name: "Roy Hill", lon: 120.0, lat: -22.6, owner: "Hancock Prospecting", country: "australia" },
  { id: "onslow-iron", name: "Onslow Iron", lon: 115.95, lat: -22.2, owner: "Mineral Resources", country: "australia" },
  { id: "sino-iron", name: "Sino Iron", lon: 116.25, lat: -21.0, owner: "CITIC Pacific Mining", country: "australia", note: "Magnetite." },
  { id: "carajas", name: "Carajás", lon: -50.17, lat: -6.06, owner: "Vale", country: "brazil", note: "The largest iron ore mining complex in the world, high grade." },
  { id: "simandou", name: "Simandou", lon: -8.9, lat: 8.6, owner: "Rio Tinto / Chinalco (blocks 3–4), Winning Consortium / Baowu (blocks 1–2)", country: "guinea", note: "Started November 2025; up to 120 Mt a year after ramp-up." },
  { id: "kiruna", name: "Kiruna", lon: 20.22, lat: 67.85, owner: "LKAB", country: "sweden", note: "Underground magnetite mine." },
  { id: "labrador", name: "Labrador Trough", lon: -66.9, lat: 52.95, owner: "Rio Tinto (IOC), Champion Iron (Bloom Lake)", country: "canada", note: "High-grade concentrate and pellets." },
];

/* ── ABS exports: SITC 281, destinations and WA ── */

/** Flows are drawn from Port Hedland; ships also sail from Dampier, Cape Lambert and Ashburton. */
export const FLOW_ORIGIN: [number, number] = [118.58, -20.31];
export const DESTINATIONS: readonly Destination[] = [
  { code: "CHIN", name: "China", lon: 121.5, lat: 33 },
  { code: "JAP", name: "Japan", lon: 135, lat: 34.6 },
  { code: "RKOR", name: "South Korea", lon: 129.3, lat: 35.8 },
  { code: "TAIW", name: "Taiwan", lon: 120.3, lat: 22.6 },
  { code: "INIA", name: "India", lon: 86.7, lat: 20.3 },
  { code: "VIET", name: "Vietnam", lon: 106.4, lat: 18.1 },
  { code: "INDO", name: "Indonesia", lon: 106.5, lat: -6 },
];
export const IRON_ORE_EXPORTS: AbsExportSpec = {
  id: "iron-ore",
  sitc: [{ code: "281", label: "Iron ore and concentrates" }],
  destinations: DESTINATIONS,
  states: [{ code: "5", name: "Western Australia" }],
};

/* ── companies ── */

export interface IronOreCompany { name: string; tv: string; role: string; australian?: boolean; assetSlug?: string }

export const COMPANIES: readonly IronOreCompany[] = [
  { name: "Rio Tinto", tv: "ASX:RIO", role: "Pilbara: 333 Mt shipped in 2025-26 through Dampier and Cape Lambert; part owner of Simandou (Guinea) and IOC (Canada)", australian: true, assetSlug: "asx-rio" },
  { name: "BHP", tv: "ASX:BHP", role: "Pilbara: 288 Mt sold in 2025-26 through Port Hedland", australian: true, assetSlug: "asx-bhp" },
  { name: "Fortescue", tv: "ASX:FMG", role: "Pilbara: 201 Mt shipped in 2025-26 through Port Hedland, including Iron Bridge magnetite", australian: true, assetSlug: "asx-fmg" },
  { name: "Mineral Resources", tv: "ASX:MIN", role: "Onslow Iron, exporting through Ashburton", australian: true },
  { name: "Deterra Royalties", tv: "ASX:DRR", role: "Royalty on BHP's Mining Area C, so its income follows volume and price", australian: true },
  { name: "Champion Iron", tv: "ASX:CIA", role: "Bloom Lake high-grade concentrate (Canada), ASX-listed", australian: true },
  { name: "Vale", tv: "NYSE:VALE", role: "Brazil: Carajás and Minas Gerais; the largest producer outside Australia" },
];
