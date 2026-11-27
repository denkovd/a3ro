/* ────────────────────────────────────────────────────────────────
   Uranium Tracker — the civilian nuclear fuel chain (roadmap #54)
   Mining → conversion → enrichment → fuel fabrication → reactors.
   Hand-kept reference data, not live. Every figure carries a source
   and the date we checked it; update when the source updates
   (World Nuclear Association tables change every 1–2 months, the
   mining and plant tables about yearly).

   Locations: named sites are placed to within a few kilometres;
   country bubbles sit near the main producing or generating region.
   Client-safe: pure data.
──────────────────────────────────────────────────────────────── */

export type SourceId = "wnaMining" | "wnaConversion" | "wnaEnrichment" | "wnaFabrication" | "wnaReactors" | "gaUranium" | "sputReports";

export interface Source { label: string; url: string; reviewed: string; note?: string }

export const SOURCES: Record<SourceId, Source> = {
  sputReports: {
    label: "Sprott Physical Uranium Trust: annual and interim reports (also on SEDAR+)",
    url: "https://sprott.com/investment-strategies/physical-commodity-funds/uranium/financial-reports/",
    reviewed: "2026-11-27",
    note: "Pounds held at each half-year end, from the filed reports. Sprott's daily figures are on its site; its terms don't allow us to copy them.",
  },
  wnaMining: {
    label: "World Nuclear Association: World Uranium Mining Production",
    url: "https://world-nuclear.org/information-library/nuclear-fuel-cycle/mining-of-uranium/world-uranium-mining-production",
    reviewed: "2026-11-26",
    note: "Page updated 23 Oct 2026; 2024 production",
  },
  wnaConversion: {
    label: "World Nuclear Association: Conversion and Deconversion",
    url: "https://world-nuclear.org/information-library/nuclear-fuel-cycle/conversion-enrichment-and-fabrication/conversion-and-deconversion",
    reviewed: "2026-11-26",
    note: "Page updated 23 Oct 2026; licensed capacity",
  },
  wnaEnrichment: {
    label: "World Nuclear Association: Uranium Enrichment",
    url: "https://world-nuclear.org/information-library/nuclear-fuel-cycle/conversion-enrichment-and-fabrication/uranium-enrichment",
    reviewed: "2026-11-26",
    note: "Page updated 18 Nov 2026; 2025 capacity",
  },
  wnaFabrication: {
    label: "World Nuclear Association: Nuclear Fuel Fabrication",
    url: "https://world-nuclear.org/information-library/nuclear-fuel-cycle/conversion-enrichment-and-fabrication/fuel-fabrication",
    reviewed: "2026-11-26",
    note: "Page updated 2 Nov 2026; largest light-water reactor fuel plants",
  },
  wnaReactors: {
    label: "World Nuclear Association: World Nuclear Power Reactors & Uranium Requirements",
    url: "https://world-nuclear.org/information-library/facts-and-figures/world-nuclear-power-reactors-and-uranium-requireme",
    reviewed: "2026-11-26",
    note: "Table as at 25 Nov 2026; uranium required for 2025",
  },
  gaUranium: {
    label: "Geoscience Australia: Australia's Energy Commodity Resources 2026, Uranium",
    url: "https://www.ga.gov.au/aecr2026/uranium-and-thorium",
    reviewed: "2026-11-26",
    note: "Page updated 10 Aug 2026",
  },
};

/* ── 1. Mining: production by country, 2024 (tonnes U) ── */

export interface MiningCountry {
  id: string; name: string; lon: number; lat: number;
  /** Mine production, tonnes U. */
  t2023: number; t2024: number;
  estimate?: boolean;
}

export const MINING_YEAR = 2024;
export const WORLD_MINE_OUTPUT_T = { 2023: 54_433, 2024: 60_213 } as const;
/** Mine output as a share of world reactor demand (WNA). */
export const MINE_SHARE_OF_DEMAND = { 2023: 0.83, 2024: 0.9 } as const;

export const MINING_COUNTRIES: MiningCountry[] = [
  { id: "kazakhstan", name: "Kazakhstan", lon: 67.5, lat: 45.0, t2023: 21_109, t2024: 23_270 },
  { id: "canada", name: "Canada", lon: -105.0, lat: 57.5, t2023: 11_001, t2024: 14_309 },
  { id: "namibia", name: "Namibia", lon: 15.2, lat: -22.6, t2023: 6_986, t2024: 7_333 },
  { id: "australia", name: "Australia", lon: 137.5, lat: -30.5, t2023: 4_693, t2024: 4_598 },
  { id: "uzbekistan", name: "Uzbekistan", lon: 64.5, lat: 41.5, t2023: 4_000, t2024: 4_000, estimate: true },
  { id: "russia", name: "Russia", lon: 118.0, lat: 50.1, t2023: 2_710, t2024: 2_738 },
  { id: "china", name: "China", lon: 104.0, lat: 35.0, t2023: 1_600, t2024: 1_600, estimate: true },
  { id: "niger", name: "Niger", lon: 7.4, lat: 18.7, t2023: 1_130, t2024: 962 },
  { id: "india", name: "India", lon: 86.2, lat: 22.6, t2023: 485, t2024: 500, estimate: true },
  { id: "ukraine", name: "Ukraine", lon: 33.4, lat: 48.5, t2023: 340, t2024: 288, estimate: true },
  { id: "usa", name: "USA", lon: -106.0, lat: 42.5, t2023: 19, t2024: 260 },
  { id: "south-africa", name: "South Africa", lon: 27.0, lat: -26.5, t2023: 200, t2024: 200, estimate: true },
];

/* ── Largest mines, 2024 (WNA top 10, plus Australia's other operating mines) ── */

export interface Mine {
  id: string; name: string; countryId: string; owner: string;
  method: "Underground" | "Open pit" | "In-situ leach" | "By-product (copper)";
  /** 2024 production, tonnes U, where the source gives it. */
  t2024?: number;
  /** Named-site pin; omitted for Kazakhstan's in-situ leach fields, shown in the country panel. */
  lon?: number; lat?: number;
  source: SourceId;
}

export const MINES: Mine[] = [
  { id: "mcarthur", name: "McArthur River / Key Lake", countryId: "canada", owner: "Cameco", method: "Underground", t2024: 7_808, lon: -105.05, lat: 57.76, source: "wnaMining" },
  { id: "cigar", name: "Cigar Lake", countryId: "canada", owner: "Cameco / Orano", method: "Underground", t2024: 6_501, lon: -104.53, lat: 58.07, source: "wnaMining" },
  { id: "husab", name: "Husab", countryId: "namibia", owner: "Swakop Uranium (CGN)", method: "Open pit", t2024: 4_437, lon: 15.03, lat: -22.62, source: "wnaMining" },
  { id: "karatau", name: "Karatau (Budenovskoye 2)", countryId: "kazakhstan", owner: "Uranium One / Kazatomprom", method: "In-situ leach", t2024: 3_299, source: "wnaMining" },
  { id: "inkai", name: "Inkai, sites 1–3", countryId: "kazakhstan", owner: "Kazatomprom / Cameco", method: "In-situ leach", t2024: 2_992, source: "wnaMining" },
  { id: "akdala", name: "Akdala & South Inkai 4", countryId: "kazakhstan", owner: "Uranium One / Kazatomprom", method: "In-situ leach", t2024: 2_803, source: "wnaMining" },
  { id: "olympic-dam", name: "Olympic Dam", countryId: "australia", owner: "BHP", method: "By-product (copper)", t2024: 2_693, lon: 136.88, lat: -30.44, source: "wnaMining" },
  { id: "moinkum", name: "Moinkum & Tortkuduk", countryId: "kazakhstan", owner: "Orano / Kazatomprom", method: "In-situ leach", t2024: 2_388, source: "wnaMining" },
  { id: "rossing", name: "Rössing", countryId: "namibia", owner: "CNNC", method: "Open pit", t2024: 2_205, lon: 15.05, lat: -22.48, source: "wnaMining" },
  { id: "khorassan", name: "Khorassan 1", countryId: "kazakhstan", owner: "Kazatomprom / Uranium One", method: "In-situ leach", t2024: 2_030, source: "wnaMining" },
  { id: "four-mile", name: "Four Mile", countryId: "australia", owner: "Heathgate Resources", method: "In-situ leach", lon: 139.66, lat: -30.17, source: "gaUranium" },
  { id: "honeymoon", name: "Honeymoon", countryId: "australia", owner: "Boss Energy", method: "In-situ leach", lon: 140.66, lat: -31.75, source: "gaUranium" },
];

/* ── 2–4. Processing sites ── */

export type Stage = "conversion" | "enrichment" | "fabrication";

export const STAGE_LABEL: Record<Stage, string> = {
  conversion: "Conversion",
  enrichment: "Enrichment",
  fabrication: "Fuel fabrication",
};
export const STAGE_UNIT: Record<Stage, string> = {
  conversion: "t U/yr licensed",
  enrichment: "thousand SWU/yr",
  fabrication: "t/yr",
};
export const STAGE_EXPLAINER: Record<Stage, string> = {
  conversion: "Mined uranium oxide is turned into uranium hexafluoride (UF6), the gas enrichment plants use.",
  enrichment: "Raises the share of uranium-235 from 0.7% to the 3–5% most power reactors burn. Measured in separative work units (SWU).",
  fabrication: "Enriched uranium is made into pellets, sealed in rods and built into the fuel assemblies loaded into reactors.",
};

export interface Site {
  id: string; stage: Stage; name: string; company: string; country: string;
  lon: number; lat: number;
  /** Capacity in STAGE_UNIT; null where the source gives only a group total. */
  capacity: number | null;
  /** Group or country total the site belongs to, when capacity is shared. */
  groupNote?: string;
  status?: string;
  estimate?: boolean;
  source: SourceId;
}

export const SITES: Site[] = [
  // Conversion (UF6), licensed capacity, t U/yr. World total 62,000.
  { id: "port-hope", stage: "conversion", name: "Port Hope", company: "Cameco", country: "Canada", lon: -78.30, lat: 43.95, capacity: 12_500, source: "wnaConversion" },
  { id: "pierrelatte", stage: "conversion", name: "Pierrelatte & Malvési", company: "Orano", country: "France", lon: 4.70, lat: 44.36, capacity: 15_000, source: "wnaConversion" },
  { id: "metropolis", stage: "conversion", name: "Metropolis", company: "ConverDyn", country: "USA", lon: -88.73, lat: 37.15, capacity: 7_000, status: "Restarted July 2023 after shutdown from 2017", source: "wnaConversion" },
  { id: "seversk-conv", stage: "conversion", name: "Seversk", company: "Rosatom", country: "Russia", lon: 84.88, lat: 56.60, capacity: 12_500, estimate: true, source: "wnaConversion" },
  { id: "lanzhou-conv", stage: "conversion", name: "Lanzhou & Hengyang", company: "CNNC", country: "China", lon: 103.83, lat: 36.06, capacity: 15_000, estimate: true, source: "wnaConversion" },

  // Enrichment, 2025 capacity, thousand SWU/yr.
  { id: "georges-besse", stage: "enrichment", name: "Georges Besse II, Tricastin", company: "Orano", country: "France", lon: 4.73, lat: 44.33, capacity: 7_500, status: "Expansion to about 10,000 by 2030", source: "wnaEnrichment" },
  { id: "almelo", stage: "enrichment", name: "Almelo", company: "Urenco", country: "Netherlands", lon: 6.66, lat: 52.36, capacity: null, groupNote: "Urenco's four sites total 17,300", source: "wnaEnrichment" },
  { id: "gronau", stage: "enrichment", name: "Gronau", company: "Urenco", country: "Germany", lon: 7.02, lat: 52.21, capacity: null, groupNote: "Urenco's four sites total 17,300", source: "wnaEnrichment" },
  { id: "capenhurst", stage: "enrichment", name: "Capenhurst", company: "Urenco", country: "UK", lon: -2.95, lat: 53.26, capacity: null, groupNote: "Urenco's four sites total 17,300", source: "wnaEnrichment" },
  { id: "eunice", stage: "enrichment", name: "Eunice, New Mexico (UUSA)", company: "Urenco USA", country: "USA", lon: -103.07, lat: 32.44, capacity: 4_300, status: "Expansion: +700 by 2027", groupNote: "Part of Urenco's 17,300", source: "wnaEnrichment" },
  { id: "novouralsk", stage: "enrichment", name: "Novouralsk", company: "Rosatom", country: "Russia", lon: 60.08, lat: 57.25, capacity: null, groupNote: "Rosatom's four sites total about 29,100", source: "wnaEnrichment" },
  { id: "zelenogorsk", stage: "enrichment", name: "Zelenogorsk", company: "Rosatom", country: "Russia", lon: 94.59, lat: 56.11, capacity: null, groupNote: "Rosatom's four sites total about 29,100", source: "wnaEnrichment" },
  { id: "seversk-enr", stage: "enrichment", name: "Seversk", company: "Rosatom", country: "Russia", lon: 84.92, lat: 56.63, capacity: null, groupNote: "Rosatom's four sites total about 29,100", source: "wnaEnrichment" },
  { id: "angarsk", stage: "enrichment", name: "Angarsk", company: "Rosatom", country: "Russia", lon: 103.89, lat: 52.54, capacity: null, groupNote: "Rosatom's four sites total about 29,100", source: "wnaEnrichment" },
  { id: "hanzhong", stage: "enrichment", name: "Shaanxi (Hanzhong) and other sites", company: "CNNC", country: "China", lon: 107.03, lat: 33.07, capacity: null, estimate: true, groupNote: "CNNC total: about 9,000 (text) to 13,800 (table)", source: "wnaEnrichment" },
  { id: "rokkasho", stage: "enrichment", name: "Rokkasho", company: "JNFL", country: "Japan", lon: 141.33, lat: 40.96, capacity: 150, status: "450 licensed", source: "wnaEnrichment" },
  { id: "resende", stage: "enrichment", name: "Resende", company: "INB", country: "Brazil", lon: -44.45, lat: -22.47, capacity: null, groupNote: "Small quantities", source: "wnaEnrichment" },

  // Fuel fabrication, largest light-water reactor fuel plants, t/yr.
  { id: "columbia", stage: "fabrication", name: "Columbia", company: "Westinghouse", country: "USA", lon: -80.93, lat: 33.88, capacity: 1_600, source: "wnaFabrication" },
  { id: "elektrostal", stage: "fabrication", name: "Elektrostal", company: "TVEL", country: "Russia", lon: 38.45, lat: 55.79, capacity: 1_560, source: "wnaFabrication" },
  { id: "romans", stage: "fabrication", name: "Romans", company: "Framatome", country: "France", lon: 5.05, lat: 45.04, capacity: 1_400, source: "wnaFabrication" },
  { id: "richland", stage: "fabrication", name: "Richland", company: "Framatome Inc", country: "USA", lon: -119.28, lat: 46.28, capacity: 1_200, source: "wnaFabrication" },
  { id: "novosibirsk", stage: "fabrication", name: "Novosibirsk", company: "TVEL", country: "Russia", lon: 82.92, lat: 55.03, capacity: 1_200, source: "wnaFabrication" },
  { id: "wilmington", stage: "fabrication", name: "Wilmington", company: "Global Nuclear Fuel", country: "USA", lon: -77.88, lat: 34.32, capacity: 1_000, source: "wnaFabrication" },
  { id: "daejeon", stage: "fabrication", name: "Daejeon", company: "KEPCO NF", country: "South Korea", lon: 127.38, lat: 36.35, capacity: 900, source: "wnaFabrication" },
  { id: "yibin", stage: "fabrication", name: "Yibin", company: "CJNF", country: "China", lon: 104.63, lat: 28.77, capacity: 800, source: "wnaFabrication" },
  { id: "vasteras", stage: "fabrication", name: "Västerås", company: "Westinghouse", country: "Sweden", lon: 16.55, lat: 59.61, capacity: 800, source: "wnaFabrication" },
];

export const CONVERSION_WORLD_T = 62_000;
export const ENRICHMENT_GROUP_TOTALS = [
  { company: "Rosatom", kswu: 29_133, note: "four Russian sites" },
  { company: "Urenco", kswu: 17_300, note: "Netherlands, Germany, UK, USA" },
  { company: "CNNC", kswu: 9_000, note: "estimate: about 9,000 in text, 13,789 in table", estimate: true },
  { company: "Orano", kswu: 7_500, note: "Tricastin" },
] as const;

/* ── 5. Reactors and demand by country (WNA table as at 25 Nov 2026) ── */

export interface ReactorCountry {
  id: string; name: string; lon: number; lat: number;
  operable: number; mwe: number; construction: number; planned: number; proposed: number;
  /** Uranium required in 2025, tonnes U. */
  uReq: number;
}

export const REACTORS_AS_AT = "25 Nov 2026";
export const REACTOR_WORLD = { operable: 444, mwe: 406_748, construction: 82, planned: 118, proposed: 336, uReq: 68_920 } as const;

export const REACTOR_COUNTRIES: ReactorCountry[] = [
  { id: "usa", name: "USA", lon: -90, lat: 38, operable: 94, mwe: 96_952, construction: 0, planned: 0, proposed: 25, uReq: 19_011 },
  { id: "china", name: "China", lon: 116, lat: 30, operable: 65, mwe: 65_085, construction: 42, planned: 38, proposed: 142, uReq: 13_872 },
  { id: "france", name: "France", lon: 2.5, lat: 46.5, operable: 57, mwe: 63_000, construction: 0, planned: 2, proposed: 4, uReq: 8_389 },
  { id: "russia", name: "Russia", lon: 40, lat: 55, operable: 34, mwe: 27_969, construction: 7, planned: 23, proposed: 9, uReq: 6_251 },
  { id: "japan", name: "Japan", lon: 137, lat: 36, operable: 33, mwe: 31_679, construction: 2, planned: 0, proposed: 1, uReq: 2_135 },
  { id: "korea", name: "South Korea", lon: 128, lat: 36, operable: 26, mwe: 25_609, construction: 4, planned: 0, proposed: 0, uReq: 4_703 },
  { id: "india", name: "India", lon: 78, lat: 21, operable: 24, mwe: 7_935, construction: 8, planned: 14, proposed: 26, uReq: 1_884 },
  { id: "canada", name: "Canada", lon: -80, lat: 44.5, operable: 17, mwe: 12_714, construction: 1, planned: 1, proposed: 20, uReq: 1_455 },
  { id: "ukraine", name: "Ukraine", lon: 31, lat: 49, operable: 15, mwe: 13_107, construction: 2, planned: 2, proposed: 7, uReq: 890 },
  { id: "uk", name: "United Kingdom", lon: -2, lat: 53, operable: 9, mwe: 5_883, construction: 3, planned: 3, proposed: 16, uReq: 896 },
  { id: "spain", name: "Spain", lon: -3.7, lat: 40, operable: 7, mwe: 7_123, construction: 0, planned: 0, proposed: 0, uReq: 1_218 },
  { id: "sweden", name: "Sweden", lon: 16, lat: 59, operable: 6, mwe: 7_014, construction: 0, planned: 3, proposed: 16, uReq: 968 },
  { id: "czechia", name: "Czech Republic", lon: 15.5, lat: 49.8, operable: 6, mwe: 3_972, construction: 0, planned: 3, proposed: 5, uReq: 707 },
  { id: "slovakia", name: "Slovakia", lon: 19.5, lat: 48.6, operable: 6, mwe: 2_746, construction: 0, planned: 0, proposed: 1, uReq: 443 },
  { id: "pakistan", name: "Pakistan", lon: 69, lat: 27, operable: 6, mwe: 3_262, construction: 1, planned: 0, proposed: 0, uReq: 521 },
  { id: "finland", name: "Finland", lon: 25, lat: 62, operable: 5, mwe: 4_369, construction: 0, planned: 0, proposed: 0, uReq: 609 },
  { id: "uae", name: "UAE", lon: 52.2, lat: 23.9, operable: 4, mwe: 5_348, construction: 0, planned: 0, proposed: 0, uReq: 902 },
  { id: "hungary", name: "Hungary", lon: 19, lat: 47, operable: 4, mwe: 1_916, construction: 1, planned: 1, proposed: 0, uReq: 320 },
  { id: "switzerland", name: "Switzerland", lon: 8.2, lat: 46.8, operable: 4, mwe: 2_973, construction: 0, planned: 0, proposed: 0, uReq: 412 },
  { id: "argentina", name: "Argentina", lon: -60, lat: -34, operable: 3, mwe: 1_631, construction: 1, planned: 0, proposed: 4, uReq: 132 },
  { id: "belarus", name: "Belarus", lon: 26, lat: 54.8, operable: 2, mwe: 2_220, construction: 0, planned: 1, proposed: 0, uReq: 348 },
  { id: "belgium", name: "Belgium", lon: 4.5, lat: 50.8, operable: 2, mwe: 2_056, construction: 0, planned: 0, proposed: 0, uReq: 276 },
  { id: "brazil", name: "Brazil", lon: -44.4, lat: -23, operable: 2, mwe: 1_884, construction: 1, planned: 0, proposed: 0, uReq: 335 },
  { id: "bulgaria", name: "Bulgaria", lon: 23.7, lat: 43.7, operable: 2, mwe: 2_006, construction: 0, planned: 2, proposed: 0, uReq: 338 },
  { id: "mexico", name: "Mexico", lon: -96.4, lat: 19.7, operable: 2, mwe: 1_552, construction: 0, planned: 0, proposed: 0, uReq: 237 },
  { id: "romania", name: "Romania", lon: 28, lat: 44.3, operable: 2, mwe: 1_300, construction: 0, planned: 8, proposed: 0, uReq: 183 },
  { id: "south-africa", name: "South Africa", lon: 18.4, lat: -33.7, operable: 2, mwe: 1_854, construction: 0, planned: 0, proposed: 3, uReq: 281 },
  { id: "armenia", name: "Armenia", lon: 44.1, lat: 40.2, operable: 1, mwe: 416, construction: 0, planned: 0, proposed: 1, uReq: 56 },
  { id: "bangladesh", name: "Bangladesh", lon: 89, lat: 24.1, operable: 1, mwe: 1_080, construction: 1, planned: 0, proposed: 2, uReq: 179 },
  { id: "iran", name: "Iran", lon: 50.9, lat: 28.8, operable: 1, mwe: 915, construction: 1, planned: 2, proposed: 6, uReq: 149 },
  { id: "netherlands", name: "Netherlands", lon: 3.7, lat: 51.4, operable: 1, mwe: 482, construction: 0, planned: 0, proposed: 2, uReq: 72 },
  { id: "slovenia", name: "Slovenia", lon: 15.5, lat: 45.9, operable: 1, mwe: 696, construction: 0, planned: 0, proposed: 1, uReq: 128 },
  { id: "turkey", name: "Turkey", lon: 33.5, lat: 36.1, operable: 0, mwe: 0, construction: 4, planned: 0, proposed: 8, uReq: 620 },
  { id: "egypt", name: "Egypt", lon: 28.5, lat: 31, operable: 0, mwe: 0, construction: 4, planned: 0, proposed: 0, uReq: 0 },
  { id: "poland", name: "Poland", lon: 18, lat: 54.7, operable: 0, mwe: 0, construction: 0, planned: 7, proposed: 23, uReq: 0 },
  { id: "uzbekistan-r", name: "Uzbekistan", lon: 66, lat: 40.5, operable: 0, mwe: 0, construction: 0, planned: 4, proposed: 0, uReq: 0 },
  { id: "kazakhstan-r", name: "Kazakhstan", lon: 74, lat: 46, operable: 0, mwe: 0, construction: 0, planned: 2, proposed: 2, uReq: 0 },
  { id: "vietnam", name: "Vietnam", lon: 108.9, lat: 11.6, operable: 0, mwe: 0, construction: 0, planned: 2, proposed: 4, uReq: 0 },
];

/* ── Australia ── */

export const AUSTRALIA = {
  /** Share of the world's Reasonably Assured Resources recoverable under US$130/kgU. */
  resourceShare: 0.32,
  productionRank2024: 4,
  productionShare2024: 0.08,
  operatingMines: ["Olympic Dam (BHP)", "Four Mile (Heathgate Resources)", "Honeymoon (Boss Energy)"],
  largestDeposit: "Olympic Dam, South Australia, is the world's largest uranium deposit.",
  reactors: 0,
  source: "gaUranium" as SourceId,
};

/* ── Listed companies and funds (prices via TradingView, delayed) ── */

export interface UraniumCompany {
  name: string; tv: string; role: string; australian?: boolean;
  /** Our free asset page, when the company has one (lib/assets.ts). */
  assetSlug?: string;
}

export const COMPANIES: UraniumCompany[] = [
  { name: "Cameco", tv: "NYSE:CCJ", role: "Producer: McArthur River / Key Lake and Cigar Lake (Canada); Port Hope conversion; part owner of Inkai (Kazakhstan)" },
  { name: "Kazatomprom", tv: "LSE:KAP", role: "Kazakhstan's national producer, partner in most of its in-situ leach fields" },
  { name: "Sprott Physical Uranium Trust", tv: "TSX:U.UN", role: "Holds physical uranium; its buying is a read on investor demand" },
  { name: "BHP", tv: "ASX:BHP", role: "Olympic Dam (South Australia): uranium as a by-product of copper", australian: true, assetSlug: "asx-bhp" },
  { name: "Paladin Energy", tv: "ASX:PDN", role: "Langer Heinrich (Namibia), ASX-listed", australian: true },
  { name: "Boss Energy", tv: "ASX:BOE", role: "Honeymoon (South Australia), restarted 2024", australian: true },
  { name: "Deep Yellow", tv: "ASX:DYL", role: "Developer: Tumas (Namibia) and Australian projects", australian: true },
  { name: "NexGen Energy", tv: "NYSE:NXE", role: "Developer: Rook I / Arrow (Athabasca Basin, Canada)" },
  { name: "Denison Mines", tv: "NYSE:DNN", role: "Developer: Wheeler River (Athabasca Basin, Canada)" },
  { name: "Global X Uranium ETF", tv: "AMEX:URA", role: "Fund holding uranium miners and nuclear suppliers", assetSlug: "ura" },
];

/* ── Sprott Physical Uranium Trust holdings (roadmap #79) ──────────
   Pounds of U3O8 held at each half-year end, from the trust's filed annual
   and interim reports. Sprott publishes daily holdings on its website, but
   its terms of use forbid scraping or republishing website content, so the
   daily series is out until Sprott gives written permission. Add the next
   figure when the report is filed (manual job "uranium-sput-holdings").
   Jun 2024 is missing: the interim report wasn't checked. */
export interface SputHolding { date: string; lb: number }
export const SPUT_HOLDINGS: SputHolding[] = [
  { date: "2022-12-31", lb: 59_269_000 },
  { date: "2023-06-30", lb: 61_745_847 },
  { date: "2023-12-31", lb: 63_161_826 },
  { date: "2024-12-31", lb: 66_220_326 },
  { date: "2025-06-30", lb: 67_670_326 },
  { date: "2025-12-31", lb: 74_789_404 },
  { date: "2026-06-30", lb: 81_447_348 },
];
/** Pounds of U3O8 per tonne of uranium (1 tU = 1.1792 t U3O8 = 2,599.8 lb). */
export const LB_U3O8_PER_TU = 2599.8;
