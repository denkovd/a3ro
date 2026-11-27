/* ────────────────────────────────────────────────────────────────
   What the iron ore price means for Australia (roadmap #126 stage 2).

   Price bands are our reading of published costs, not a forecast:
   the lowest-cost Pilbara majors spend roughly US$18–25 a tonne to
   mine and rail ore to port (C1 / unit cost guidance), before
   freight to China (~US$10/t), royalties (7.5% of the price in WA),
   sustaining capital and discounts for lower-grade ore. So below
   about US$40 CFR even the majors earn little; smaller and higher-
   cost WA producers need roughly US$80+.

   Treasury's sensitivity is the official figure: a permanent US$10/t
   move in the iron ore price (FOB, i.e. before freight) changes
   nominal GDP and tax receipts by the amounts below. Reviewed with
   each Budget and MYEFO (manual job "ironore-impact-review").
──────────────────────────────────────────────────────────────── */

export const IMPACT_REVIEWED = "2026-11-27";

export interface PriceBand { from: number; to: number; label: string; detail: string }
export const IRON_ORE_BANDS: PriceBand[] = [
  { from: 0, to: 40, label: "Crisis", detail: "Below the full cost of even the lowest-cost Pilbara mines once freight, royalties and upkeep are paid. Majors barely profit; smaller miners close." },
  { from: 40, to: 80, label: "Majors only", detail: "BHP, Rio Tinto and Fortescue stay profitable, though far less than at today's prices. Higher-cost producers (smaller WA miners, magnetite projects) struggle; cuts and closures likely." },
  { from: 80, to: 120, label: "Healthy", detail: "Most WA producers profitable. Strong royalties for WA and company tax for Canberra." },
  { from: 120, to: 200, label: "Boom", detail: "Windfall margins: record dividends and budget surpluses, as in 2021." },
];

/** Treasury, MYEFO 2025–26, Part 5 Table 5.1: a permanent US$10/t increase (A$bn; a decrease is the mirror image). */
export const TREASURY_SENSITIVITY = {
  source: { label: "Treasury, MYEFO 2025–26, Part 5: Sensitivity analysis", url: "https://budget.gov.au/content/myefo/download/05_Part_5.pdf" },
  years: ["2025–26", "2026–27", "2027–28", "2028–29"],
  nominalGdpBn: [4.8, 2.4, 5.3, 9.9],
  taxReceiptsBn: [0.3, 0.3, 0.3, 1.9],
};

/** Western Australia's own budget assumptions (US$/t, 62% Fe CFR). */
export const WA_ASSUMPTION = {
  source: { label: "WA Government, Iron ore profile (July 2026)", url: "https://www.wa.gov.au/system/files/2026-08/waironoreprofilejuly2026.docx" },
  fy2027: 85.2,
  longRun: 72.0,
};

export const COST_SOURCES = [
  { label: "Fortescue half-year results to Dec 2025 (C1 US$17.78/t)", url: "https://www.geomechanics.io/news/article/fortescue-record-iron-ore-shipments-cost-margin-and-volume-insights-for-mine-planners" },
  { label: "Rio Tinto 2026 Pilbara cost guidance (US$23.50–25 a wet tonne), Argus", url: "https://www.argusmedia.com/en/news-and-insights/latest-market-news/2816783-rio-tinto-posts-higher-iron-ore-output-in-jan-mar" },
];

export const bandFor = (price: number): PriceBand => IRON_ORE_BANDS.find((b) => price >= b.from && price < b.to) ?? IRON_ORE_BANDS[IRON_ORE_BANDS.length - 1];
