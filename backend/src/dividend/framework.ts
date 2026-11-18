// AI Dividend — the measurement chain.
//
// The module asks one question: as AI capability rises, how much of it turns
// into real output, who captures the value, and what physical limits could
// stop it? Each stage below is one link in that chain. A stage lists what it
// will measure and where the data comes from, plus which already-live baseline
// indicators (see indicators.ts) it can show today. Stages without live data
// are shown as planned, never filled with placeholder numbers.

export type DividendStageId = "capability" | "adoption" | "productivity" | "distribution" | "constraints" | "outlook";
export type DividendBuildStep = 1 | 2 | 3 | 4 | 5;

export interface DividendSourceRef {
  label: string;
  url: string;
}

export interface DividendStage {
  id: DividendStageId;
  title: string;
  question: string;
  /** Build step in which this stage gets its own dedicated data. */
  step: DividendBuildStep;
  measures: string[];
  sources: DividendSourceRef[];
  /** Baseline indicator keys this stage can already show. */
  liveIndicatorKeys: string[];
}

export const DIVIDEND_BUILD_STEPS: Record<DividendBuildStep, string> = {
  1: "Rename and restructure around the measurement chain",
  2: "Value-chain profit and loss from company filings",
  3: "Capability, adoption and the conversion gap",
  4: "Energy, water, uranium and compute constraint gauges",
  5: "Five-year outlook and the prediction ledger",
};

export const DIVIDEND_CURRENT_STEP: DividendBuildStep = 1;
export const DIVIDEND_OUTLOOK_END_YEAR = 2031;

export const DIVIDEND_STAGES: DividendStage[] = [
  {
    id: "capability", title: "Capability", step: 3,
    question: "How fast is AI getting more capable, and cheaper to use?",
    measures: ["Frontier benchmark scores over time", "Cost per task at a fixed capability level", "Training compute of frontier models"],
    sources: [
      { label: "Epoch AI", url: "https://epoch.ai/data" },
      { label: "Stanford AI Index", url: "https://hai.stanford.edu/ai-index" },
      { label: "Artificial Analysis", url: "https://artificialanalysis.ai" },
    ],
    liveIndicatorKeys: [],
  },
  {
    id: "adoption", title: "Adoption", step: 3,
    question: "How many firms and workers actually use it?",
    measures: ["Share of firms using AI to produce goods or services", "Worker usage rates", "Enterprise AI revenue"],
    sources: [
      { label: "US Census Business Trends and Outlook Survey", url: "https://www.census.gov/hfp/btos/data_downloads" },
      { label: "ABS business characteristics", url: "https://www.abs.gov.au/statistics/industry/technology-and-innovation/characteristics-australian-business" },
    ],
    liveIndicatorKeys: [],
  },
  {
    id: "productivity", title: "Productivity", step: 3,
    question: "Is capability turning into measurable output?",
    measures: ["Productivity in AI-exposed vs less-exposed industries", "The conversion gap: capability growth vs measured productivity growth"],
    sources: [{ label: "BLS industry productivity", url: "https://www.bls.gov/productivity/" }],
    liveIndicatorKeys: ["productivity"],
  },
  {
    id: "distribution", title: "Who benefits", step: 2,
    question: "Where does each dollar of AI spending end up?",
    measures: ["Revenue, operating margin, capex and free cash flow for each value-chain layer", "Entry-level employment in AI-exposed occupations", "Labour share and household income"],
    sources: [
      { label: "SEC EDGAR XBRL data", url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces" },
      { label: "NY Fed labour market for recent graduates", url: "https://www.newyorkfed.org/research/college-labor-market" },
      { label: "Indeed Hiring Lab", url: "https://data.indeed.com" },
    ],
    liveIndicatorKeys: ["real_compensation", "unemployment", "real_median_dpi", "income_bottom40", "income_middle40", "income_top20", "wealth_top1", "wealth_bottom50"],
  },
  {
    id: "constraints", title: "Constraints", step: 4,
    question: "What physical or financial limits could slow it down?",
    measures: ["Data-centre electricity demand vs new firm capacity", "Water use in water-stressed regions", "Uranium demand vs mine supply", "Chip and memory lead times", "AI capex relative to AI revenue"],
    sources: [
      { label: "EIA electricity data", url: "https://www.eia.gov/electricity/" },
      { label: "IEA Energy and AI", url: "https://www.iea.org/reports/energy-and-ai" },
      { label: "NERC reliability assessments", url: "https://www.nerc.com/our-work/assessments" },
      { label: "WRI Aqueduct water risk", url: "https://www.wri.org/aqueduct" },
      { label: "EIA uranium marketing", url: "https://www.eia.gov/uranium/marketing/" },
    ],
    liveIndicatorKeys: ["electricity_prices"],
  },
  {
    id: "outlook", title: "Outlook", step: 5,
    question: `What could the economy look like by ${DIVIDEND_OUTLOOK_END_YEAR}?`,
    measures: ["Three scenarios: dividend arrives, infrastructure bubble deflates, gains pool upstream", "Dated quarterly predictions, scored when the data arrives"],
    sources: [],
    liveIndicatorKeys: [],
  },
];

export type ValueChainLayerId = "energy" | "infrastructure" | "hyperscalers" | "labs" | "adopters" | "households";

export interface ValueChainLayer {
  id: ValueChainLayerId;
  title: string;
  examples: string;
  data: string;
  /** Lower confidence where figures come from press reports rather than filings. */
  confidence: "filings" | "official statistics" | "reported";
  live: boolean;
}

export const VALUE_CHAIN_LAYERS: ValueChainLayer[] = [
  { id: "energy", title: "Energy & materials", examples: "Utilities, uranium, copper, transformers", data: "Company filings, EIA", confidence: "filings", live: false },
  { id: "infrastructure", title: "Infrastructure", examples: "Chips, networking, data-centre builders", data: "Company filings", confidence: "filings", live: false },
  { id: "hyperscalers", title: "Hyperscalers", examples: "Cloud capex vs AI revenue", data: "Company filings", confidence: "filings", live: false },
  { id: "labs", title: "Frontier labs", examples: "Reported revenue and cash burn", data: "Disclosures and press reports", confidence: "reported", live: false },
  { id: "adopters", title: "Apps & adopters", examples: "Software margins, AI-exposed firms", data: "Company filings", confidence: "filings", live: false },
  { id: "households", title: "Workers & households", examples: "Wages, jobs, income and wealth shares", data: "BLS, BEA, Federal Reserve", confidence: "official statistics", live: true },
];

export function stageStatus(stage: DividendStage): "partial" | "planned" {
  return stage.liveIndicatorKeys.length > 0 ? "partial" : "planned";
}
