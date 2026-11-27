/* ────────────────────────────────────────────────────────────────
   What copper and LNG prices mean for Australia (roadmap #126 stage 3).

   Unlike iron ore, Treasury doesn't publish a sensitivity for these,
   so the rule of thumb is simple arithmetic anyone can check: export
   volume × a price move. It shows the size of the effect on export
   earnings, before costs, tax and currency; it is not a forecast.
   Reviewed with each Resources and Energy Quarterly (March, June,
   September, December) — manual job "export-impact-review".
──────────────────────────────────────────────────────────────── */

export const EXPORT_IMPACT_REVIEWED = "2026-11-28";
/** 1 tonne of LNG holds about 52 MMBtu of energy. */
export const MMBTU_PER_TONNE_LNG = 52;

export interface ExportImpact {
  /** Volume Australia exports in a year, in the unit the price is quoted per (t or MMBtu). */
  volumeLabel: string;
  volumePerYear: number;
  /** The price move the rule of thumb is stated for. */
  step: number;
  stepLabel: string;
  /** REQ's price assumption for the current financial year, same unit as the monthly price. */
  reqPrice: { value: number; label: string } | null;
  reqEarnings: string;
  caveat: string;
  sources: { label: string; url: string }[];
}

const REQ_SEP_2026 = { label: "Resources and Energy Quarterly, September 2026 (Dept of Industry, Science and Resources, CC BY 4.0)", url: "https://www.industry.gov.au/publications/resources-and-energy-quarterly-september-2026" };

export const COPPER_IMPACT: ExportImpact = {
  volumeLabel: "730 thousand tonnes of copper forecast for 2026–27",
  volumePerYear: 730_000,
  step: 1000, stepLabel: "US$1,000 a tonne",
  reqPrice: { value: 13_754, label: "REQ's 2026–27 assumption" },
  reqEarnings: "REQ forecasts copper export earnings rising from about A$14 billion in 2025–26 to A$16 billion in 2026–27, as new mines and expansions add volume.",
  caveat: "Copper miners' profits also depend on gold and other by-products, costs and the Australian dollar. Australia is a small share of world supply, so its mines take the world price rather than set it.",
  sources: [REQ_SEP_2026],
};

export const LNG_IMPACT: ExportImpact = {
  volumeLabel: `78 million tonnes of LNG in the year to April 2026 (about ${(78 * MMBTU_PER_TONNE_LNG / 1000).toFixed(1)} billion MMBtu)`,
  volumePerYear: 78_000_000 * MMBTU_PER_TONNE_LNG,
  step: 1, stepLabel: "US$1 per MMBtu",
  reqPrice: null,
  reqEarnings: "REQ forecasts LNG export earnings rising from about A$57 billion in 2025–26 to A$70 billion in 2026–27 on prices lifted by the Middle East conflict, then falling as prices ease.",
  caveat: "Most Australian LNG is sold on long-term contracts priced off oil with a lag of three to four months, so a move in the spot price reaches export earnings slowly and only in part. The rule of thumb is the most a sustained move could add or take away. Much of the gain goes to foreign-owned projects and is taxed through PRRT and company tax.",
  sources: [REQ_SEP_2026, { label: "WA Government, LNG profile (May and June 2026)", url: "https://www.wa.gov.au/system/files/2026-07/walngprofilejune2026.docx" }],
};
