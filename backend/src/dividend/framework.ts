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
  3: "Capability, adoption, the conversion gap and entry-level jobs",
  4: "Constraint gauges: power, water, uranium, copper and financing",
  5: "Outlook to 2031: signposts, scenarios and dated predictions",
};

export const DIVIDEND_CURRENT_STEP: DividendBuildStep = 5;
export const DIVIDEND_OUTLOOK_END_YEAR = 2031;

const m = (step: DividendBuildStep, ...labels: string[]): DividendMeasure[] => labels.map(label => ({ label, step }));

export const DIVIDEND_STAGES: DividendStage[] = [
  {
    id: "capability", title: "Capability",
    question: "How fast is AI getting more capable, and how quickly can others catch up?",
    measures: m(3, "Frontier capability over time (Epoch Capabilities Index)", "Gap between the best closed and best open-weights models"),
    sources: [
      { label: "Epoch AI Capabilities Index", url: "https://epoch.ai/benchmarks" },
    ],
    liveIndicatorKeys: [],
  },
  {
    id: "adoption", title: "Adoption",
    question: "How many firms and workers actually use it?",
    measures: m(3, "Share of US businesses using AI in the last two weeks", "Share expecting to use AI within six months"),
    sources: [
      { label: "US Census Business Trends and Outlook Survey", url: "https://www.census.gov/hfp/btos/data_downloads" },
    ],
    liveIndicatorKeys: [],
  },
  {
    id: "productivity", title: "Productivity",
    question: "Is capability turning into measurable output?",
    measures: [...m(1, "Economy-wide output per hour"), ...m(3, "The conversion gap: productivity growth since ChatGPT vs the pre-pandemic trend")],
    sources: [{ label: "BLS productivity and costs", url: "https://www.bls.gov/productivity/" }],
    liveIndicatorKeys: ["productivity"],
  },
  {
    id: "distribution", title: "Who benefits",
    question: "Where does each dollar of AI spending end up?",
    measures: [...m(1, "Wages, jobs, household income and wealth shares"), ...m(2, "Revenue, operating margin, capex and free cash flow for each value-chain layer"), ...m(3, "Job postings in AI-exposed vs hands-on occupations", "Unemployment for ages 20–24 vs 25–54")],
    sources: [
      { label: "SEC EDGAR XBRL data", url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces" },
      { label: "Indeed Hiring Lab job postings", url: "https://github.com/hiring-lab/job_postings_tracker" },
      { label: "BLS Current Population Survey", url: "https://www.bls.gov/cps/" },
    ],
    liveIndicatorKeys: ["real_compensation", "unemployment", "unemployment_20_24", "unemployment_25_54", "real_median_dpi", "income_bottom40", "income_middle40", "income_top20", "wealth_top1", "wealth_bottom50"],
  },
  {
    id: "constraints", title: "Constraints",
    question: "What physical or financial limits could slow it down?",
    measures: [...m(1, "Household electricity prices"), ...m(4, "Electricity demand and business power prices (US and Virginia)", "Power drawn by tracked AI data centres", "Drought where AI data centres are built", "Uranium and copper prices against their 5-year averages", "Hyperscaler capex against operating cash flow")],
    sources: [
      { label: "EIA electricity data", url: "https://www.eia.gov/electricity/data/browser/" },
      { label: "Epoch AI frontier data centres", url: "https://epoch.ai/data/data-centers" },
      { label: "US Drought Monitor", url: "https://droughtmonitor.unl.edu/" },
      { label: "IMF commodity prices via FRED", url: "https://fred.stlouisfed.org/series/PURANUSDM" },
    ],
    liveIndicatorKeys: ["electricity_prices"],
  },
  {
    id: "outlook", title: "Outlook",
    question: `What could the economy look like by ${DIVIDEND_OUTLOOK_END_YEAR}?`,
    measures: m(5, "Signposts: which scenario the live evidence leans toward", "Three scenarios to 2031: dividend arrives, build-out deflates, gains pool upstream", "Dated predictions, scored when the data arrives"),
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
