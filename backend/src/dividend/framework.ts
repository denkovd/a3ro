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

export interface DividendMeasure {
  label: string;
  /** Build step that adds (or added) this measure. */
  step: DividendBuildStep;
}

export interface DividendStage {
  id: DividendStageId;
  title: string;
  question: string;
  measures: DividendMeasure[];
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

export const DIVIDEND_CURRENT_STEP: DividendBuildStep = 2;
export const DIVIDEND_OUTLOOK_END_YEAR = 2031;

const m = (step: DividendBuildStep, ...labels: string[]): DividendMeasure[] => labels.map(label => ({ label, step }));

export const DIVIDEND_STAGES: DividendStage[] = [
  {
    id: "capability", title: "Capability",
    question: "How fast is AI getting more capable, and cheaper to use?",
    measures: m(3, "Frontier benchmark scores over time", "Cost per task at a fixed capability level", "Training compute of frontier models"),
    sources: [
      { label: "Epoch AI", url: "https://epoch.ai/data" },
      { label: "Stanford AI Index", url: "https://hai.stanford.edu/ai-index" },
      { label: "Artificial Analysis", url: "https://artificialanalysis.ai" },
    ],
    liveIndicatorKeys: [],
  },
  {
    id: "adoption", title: "Adoption",
    question: "How many firms and workers actually use it?",
    measures: m(3, "Share of firms using AI to produce goods or services", "Worker usage rates", "Enterprise AI revenue"),
    sources: [
      { label: "US Census Business Trends and Outlook Survey", url: "https://www.census.gov/hfp/btos/data_downloads" },
      { label: "ABS business characteristics", url: "https://www.abs.gov.au/statistics/industry/technology-and-innovation/characteristics-australian-business" },
    ],
    liveIndicatorKeys: [],
  },
  {
    id: "productivity", title: "Productivity",
    question: "Is capability turning into measurable output?",
    measures: [...m(1, "Economy-wide output per hour"), ...m(3, "Productivity in AI-exposed vs less-exposed industries", "The conversion gap: capability growth vs measured productivity growth")],
    sources: [{ label: "BLS industry productivity", url: "https://www.bls.gov/productivity/" }],
    liveIndicatorKeys: ["productivity"],
  },
  {
    id: "distribution", title: "Who benefits",
    question: "Where does each dollar of AI spending end up?",
    measures: [...m(1, "Wages, jobs, household income and wealth shares"), ...m(2, "Revenue, operating margin, capex and free cash flow for each value-chain layer"), ...m(3, "Entry-level employment in AI-exposed occupations")],
    sources: [
      { label: "SEC EDGAR XBRL data", url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces" },
      { label: "NY Fed labour market for recent graduates", url: "https://www.newyorkfed.org/research/college-labor-market" },
      { label: "Indeed Hiring Lab", url: "https://data.indeed.com" },
    ],
    liveIndicatorKeys: ["real_compensation", "unemployment", "real_median_dpi", "income_bottom40", "income_middle40", "income_top20", "wealth_top1", "wealth_bottom50"],
  },
  {
    id: "constraints", title: "Constraints",
    question: "What physical or financial limits could slow it down?",
    measures: [...m(1, "Household electricity prices"), ...m(4, "Data-centre electricity demand vs new firm capacity", "Water use in water-stressed regions", "Uranium demand vs mine supply", "Chip and memory lead times", "AI capex relative to AI revenue")],
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
    id: "outlook", title: "Outlook",
    question: `What could the economy look like by ${DIVIDEND_OUTLOOK_END_YEAR}?`,
    measures: m(5, "Three scenarios: dividend arrives, infrastructure bubble deflates, gains pool upstream", "Dated quarterly predictions, scored when the data arrives"),
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
  confidence: "filings" | "official statistics" | "filings and press reports";
  /** Build step that made this layer live. */
  step: DividendBuildStep;
}

export const VALUE_CHAIN_LAYERS: ValueChainLayer[] = [
  { id: "energy", title: "Energy & materials", examples: "Power producers, grid equipment, copper, enrichment", data: "SEC 10-K / 10-Q", confidence: "filings", step: 2 },
  { id: "infrastructure", title: "Infrastructure", examples: "Chips, memory, networking, servers, data centres", data: "SEC 10-K / 10-Q", confidence: "filings", step: 2 },
  { id: "hyperscalers", title: "Hyperscalers", examples: "The cloud giants doing most AI capex", data: "SEC 10-K / 10-Q", confidence: "filings", step: 2 },
  { id: "labs", title: "Frontier labs", examples: "Model developers", data: "S-1 filings and press reports", confidence: "filings and press reports", step: 2 },
  { id: "adopters", title: "Apps & adopters", examples: "Software companies selling AI to businesses", data: "SEC 10-K / 10-Q", confidence: "filings", step: 2 },
  { id: "households", title: "Workers & households", examples: "Wages, jobs, income and wealth shares", data: "BLS, BEA, Federal Reserve", confidence: "official statistics", step: 1 },
];

export function stageStatus(stage: DividendStage, current: DividendBuildStep = DIVIDEND_CURRENT_STEP): "complete" | "partial" | "planned" {
  const done = stage.measures.filter(measure => measure.step <= current).length;
  return done === stage.measures.length ? "complete" : done > 0 ? "partial" : "planned";
}

/** The next build step that adds something to this stage, if any. */
export function nextStageStep(stage: DividendStage, current: DividendBuildStep = DIVIDEND_CURRENT_STEP): DividendBuildStep | null {
  const pending = stage.measures.filter(measure => measure.step > current).map(measure => measure.step);
  return pending.length ? (Math.min(...pending) as DividendBuildStep) : null;
}
