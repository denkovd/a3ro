import type { ScenarioId } from "./scenarios";

export const HORIZON_THEMES_VERSION = "horizon-themes-1.0.0";
export const THEME_RESEARCH_CHECKED_ON = "2026-10-18";
export type ThemeId = "grids" | "generation" | "nuclear" | "cooling" | "automation";

export interface ThemeDefinition {
  id: ThemeId;
  title: string;
  channel: string;
  beneficiaries: string;
  failure: string;
  evidenceNeeded: string;
  stressIds: string[];
  scenarioHypotheses: Record<ScenarioId, string>;
}

export const HORIZON_THEMES: ThemeDefinition[] = [
  { id: "grids", title: "Grids & electrical equipment", channel: "More productive use needs connections, distribution equipment and deliverable power—not just announced generation.", beneficiaries: "Equipment and service suppliers may benefit if funded customer orders convert into deliveries, cash and durable margins.", failure: "Cancellations, customer funding gaps, capacity overbuild, input costs or margin compression can defeat the supplier thesis.", evidenceNeeded: "Named commissioned projects, customer financing, backlog conversion, cancellation terms and realised returns on expansion.", stressIds: ["regional_power", "electricity_proxy"], scenarioHypotheses: { broad: "Delivered connections can support deployment; more capacity may also reduce scarcity pricing.", uneven: "A bottleneck may support orders, but rationing and unaffordable projects can delay actual purchases.", disruption: "A delivery shortfall is not automatically bullish: cancellations, financing pressure and idle capacity can impair returns." } },
  { id: "generation", title: "Firm power & energy services", channel: "Dispatchable generation, maintenance and fuel delivery can bridge demand and infrastructure timing gaps.", beneficiaries: "Equipment and service earnings depend on funded construction, fuel availability and operating assets, not aggregate AI demand alone.", failure: "Fuel exposure, emissions policy, cost overruns, long lead times and demand substitution can undermine project economics.", evidenceNeeded: "Financed construction, commissioned accredited capacity, fuel contracts and life-cycle economics by location.", stressIds: ["regional_power", "hydrocarbons"], scenarioHypotheses: { broad: "Higher activity can support equipment and service demand, with competition and cheaper alternatives limiting pricing.", uneven: "Delivery and fuel constraints may favour some existing assets while making new projects uneconomic.", disruption: "Stranded commitments, fuel shocks or financing failures can offset higher nominal power prices." } },
  { id: "nuclear", title: "Nuclear supply chain & reactor options", channel: "Established nuclear components and services are distinct from financing and licensing a first-of-a-kind reactor.", beneficiaries: "Operating suppliers and development-stage issuers have different cash flows, capital needs and commercial milestones.", failure: "Licensing, qualified fuel, manufacturing, cost, financing and dilution can prevent technical promise reaching per-share earnings.", evidenceNeeded: "Design-specific authorisations, qualified fuel, funded offtake, full construction financing and verified commercial operation.", stressIds: ["regional_power", "policy_delivery"], scenarioHypotheses: { broad: "Demand can support nuclear services, but abundant alternatives may weaken economics for expensive new designs.", uneven: "Interest in firm power may grow without resolving fuel, financing or licensing constraints.", disruption: "A compelling energy narrative does not fund construction or protect shareholders from dilution and delay." } },
  { id: "cooling", title: "Cooling & compute efficiency", channel: "Higher compute density creates power-management and heat-removal needs; efficiency can also reduce equipment demand per workload.", beneficiaries: "Cooling and infrastructure suppliers need paid deployments, reliable products and cash-generating capacity expansion.", failure: "Architecture shifts, efficiency gains, concentration, supply constraints or delayed data-centre projects can weaken sales and margins.", evidenceNeeded: "Customer-funded installations, utilisation, measured efficiency, service economics and conversion of working capital to cash.", stressIds: ["ai_economics", "regional_power"], scenarioHypotheses: { broad: "More deployment can support infrastructure spend, while efficiency and competition can reduce spending per unit of compute.", uneven: "Retrofitting constrained sites may create demand, but power delays can hold back new installations.", disruption: "A capex retrenchment or architectural change can overwhelm the benefits of higher density." } },
  { id: "automation", title: "Industrial automation & productivity", channel: "Productive adoption requires integration into real workflows, with measurable customer economics and working systems.", beneficiaries: "Control, automation and software providers may benefit if customer productivity translates into funded projects and recurring revenue.", failure: "Industrial cyclicality, weak customer budgets, integration failures or value captured by customers/competitors can limit supplier returns.", evidenceNeeded: "Realised customer returns, recurring revenue quality, paid deployments, pricing and cash generation rather than AI-labelled announcements.", stressIds: ["worker_proxy", "ai_economics", "cash_budgets"], scenarioHypotheses: { broad: "Broader investment can support adoption; competition may pass much of the benefit to customers and workers.", uneven: "Cost pressure may motivate automation while weaker demand and financing restrict purchase budgets.", disruption: "Unfunded transformation programmes and delayed industrial spending can reduce supplier returns even if the technology works." } },
];

export interface ResearchMetric {
  label: string;
  value: number;
  unit: "USD million" | "%";
  basis: "GAAP" | "company-defined";
  start: string | null;
  end: string;
  note: string;
}

export interface CompanyMilestone {
  label: string;
  kind: "reported" | "management_target" | "research_required";
  date: string | null;
  note: string;
}

export interface ThemeCompany {
  symbol: string;
  name: string;
  themes: ThemeId[];
  stage: "operating_supplier" | "development_option";
  sourceTitle: string;
  sourceUrl: string;
  publishedOn: string;
  checkedOn: string;
  periodLabel: string;
  exposure: string;
  metrics: ResearchMetric[];
  shares: { current: number; previous: number; end: string; basis: string; note: string } | null;
  margin: { numerator: number; denominator: number; label: string } | null;
  fundedBacklog: null;
  fundingQuestion: string;
  milestones: CompanyMilestone[];
}

const quarter = (label: string, value: number, unit: ResearchMetric["unit"] = "USD million", basis: ResearchMetric["basis"] = "GAAP", note = ""): ResearchMetric => ({ label, value, unit, basis, start: "2026-04-01", end: "2026-06-30", note });
const stock = (label: string, value: number, note = ""): ResearchMetric => ({ label, value, unit: "USD million", basis: "GAAP", start: null, end: "2026-06-30", note });

export const THEME_COMPANIES: ThemeCompany[] = [
  { symbol: "ETN", name: "Eaton", themes: ["grids"], stage: "operating_supplier", sourceTitle: "Eaton Q2 2026 earnings release · SEC Exhibit 99", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1551182/000155118226000027/etn06302026exhibit99.htm", publishedOn: "2026-07-31", checkedOn: THEME_RESEARCH_CHECKED_ON, periodLabel: "Q2 2026 · quarter ended 30 June", exposure: "Power-management exposure across several end markets, not a pure AI or utility-grid investment.", metrics: [quarter("Net sales", 8531), quarter("Consolidated net income", 823), quarter("Segment margin", 23.1, "%", "company-defined", "Segment measure, not consolidated GAAP net margin."), quarter("Operating cash flow · rounded", 1100), { ...stock("Electrical backlog annual growth", 43, "Reported growth, not a funded-project audit."), unit: "%", basis: "company-defined" }], shares: { current: 389.5, previous: 391.4, end: "2026-06-30", basis: "Quarterly diluted weighted-average shares", note: "Millions of shares; prior-year quarter. Not a forecast share count." }, margin: { numerator: 823, denominator: 8531, label: "Derived consolidated GAAP net margin" }, fundedBacklog: null, fundingQuestion: "Review acquisition financing, debt maturities, capex and customer cancellations; backlog growth is not evidence that each customer's project is financed.", milestones: [{ label: "Electrical book-to-bill 1.2", kind: "reported", date: "2026-06-30", note: "Rolling twelve-month ratio; not a commissioning or cash-collection milestone." }, { label: "Confirm financed backlog conversion", kind: "research_required", date: null, note: "Match delivery, cancellation terms and cash receipts to funded projects." }] },
  { symbol: "GEV", name: "GE Vernova", themes: ["grids", "generation"], stage: "operating_supplier", sourceTitle: "GE Vernova Q2 2026 earnings release · SEC Exhibit 99", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1996810/000199681026000147/gevpressrelease2q26.htm", publishedOn: "2026-07-22", checkedOn: THEME_RESEARCH_CHECKED_ON, periodLabel: "Q2 2026 · quarter ended 30 June", exposure: "Power equipment, electrification and wind; equipment shipments are not energised local capacity.", metrics: [quarter("Revenue · rounded", 11100), quarter("Net income margin", 5.8, "%"), quarter("Operating cash flow · rounded", 5500), stock("Cash · rounded", 13100), { ...stock("Backlog / remaining performance obligations · rounded", 176000, "Company-defined RPO, not audited customer-project financing."), basis: "company-defined" }], shares: null, margin: null, fundedBacklog: null, fundingQuestion: "Separate customer advances, working capital, services and equipment obligations before treating quarterly cash flow as a durable annual run rate.", milestones: [{ label: "Gas equipment shipped: 3 GW in Q2", kind: "reported", date: "2026-06-30", note: "Shipment is not commissioning or accredited dependable capacity." }, { label: "Annual gas-turbine output capability: 20 GW in Q3", kind: "management_target", date: "2026-09-30", note: "July management target; achievement is not verified in this research pack." }, { label: "Annual gas-turbine output capability: 24 GW in 2028", kind: "management_target", date: "2028-12-31", note: "Management target, not realised delivery or a regional power forecast." }] },
  { symbol: "VRT", name: "Vertiv", themes: ["cooling"], stage: "operating_supplier", sourceTitle: "Vertiv Q2 2026 earnings release · SEC Exhibit 99.1", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1674101/000162828026050323/q22026exhibit991vrt07292026.htm", publishedOn: "2026-07-29", checkedOn: THEME_RESEARCH_CHECKED_ON, periodLabel: "Q2 2026 · quarter ended 30 June", exposure: "Digital infrastructure power and thermal management; exposure is not proof of customer-level AI returns.", metrics: [quarter("Net sales", 3274.3), quarter("Operating profit", 637.9), quarter("GAAP operating margin", 19.5, "%"), quarter("Adjusted operating margin", 22.6, "%", "company-defined", "Non-GAAP; not interchangeable with GAAP operating margin."), quarter("Operating cash flow · rounded", 1100), stock("Cash and equivalents", 2810.6)], shares: { current: 392.746991, previous: 389.846827, end: "2026-06-30", basis: "Quarterly diluted weighted-average shares", note: "Millions of shares; prior-year quarter. Dilution can occur despite earnings growth." }, margin: { numerator: 637.9, denominator: 3274.3, label: "Derived GAAP operating margin" }, fundedBacklog: null, fundingQuestion: "Review working-capital advances, debt, expansion capex and customer concentration; cash alone does not settle future funding needs.", milestones: [{ label: "Cash-generating infrastructure operations reported", kind: "reported", date: "2026-06-30", note: "Quarterly cash flow is not a guaranteed future annual yield." }, { label: "Validate paid installation and efficiency economics", kind: "research_required", date: null, note: "Track utilisation, product reliability and customer-funded deployment." }] },
  { symbol: "BWXT", name: "BWX Technologies", themes: ["nuclear"], stage: "operating_supplier", sourceTitle: "BWXT Q2 2026 results · issuer release", sourceUrl: "https://investors.bwxt.com/news-releases/news-release-details/bwx-technologies-reports-second-quarter-2026-results", publishedOn: "2026-08-03", checkedOn: THEME_RESEARCH_CHECKED_ON, periodLabel: "Q2 2026 · quarter ended 30 June", exposure: "Government and commercial nuclear components/services; not interchangeable with a new-reactor developer or electricity owner.", metrics: [quarter("Revenue", 901.6), quarter("GAAP operating income", 114.1), quarter("Operating cash flow", 156.4), { ...stock("Total reported backlog", 8398.081, "Source table in USD thousands, converted to millions; government and commercial combined."), basis: "company-defined" }], shares: null, margin: { numerator: 114.1, denominator: 901.6, label: "Derived GAAP operating margin" }, fundedBacklog: null, fundingQuestion: "Separate government/commercial contracts, appropriations, acquisition financing and customer funding; total backlog is not an SMR revenue forecast.", milestones: [{ label: "Precision Components Group acquisition closed", kind: "reported", date: "2026-07-01", note: "Subsequent event in the release; not included as a Q2 operating achievement." }, { label: "Commercial manufacturing execution", kind: "research_required", date: null, note: "Verify capacity, deliveries and returns without assuming every nuclear design wins." }] },
  { symbol: "OKLO", name: "Oklo", themes: ["nuclear"], stage: "development_option", sourceTitle: "Oklo quarter ended June 2026 · SEC Form 10-Q", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1849056/000162828026054571/oklo-20260630.htm", publishedOn: "2026-08-07", checkedOn: THEME_RESEARCH_CHECKED_ON, periodLabel: "Q2 2026 financials; cash flow explicitly H1", exposure: "Advanced-reactor and fuel-development option; reported acquisition-related revenue is not proof of commercial reactor operation.", metrics: [quarter("GAAP net loss", -48.536), stock("Cash and equivalents · excludes restricted cash", 1644.704), { ...quarter("Operating cash flow · H1 only", -65.459), start: "2026-01-01", note: "Six months, not a single quarter or forward burn forecast." }, { ...quarter("Deployment capex and prepayments · H1", 126.9, "USD million", "company-defined"), start: "2026-01-01", note: "Do not label purchases of marketable securities as operating/project burn." }], shares: { current: 176.224404, previous: 140.085498, end: "2026-06-30", basis: "Quarterly basic and diluted weighted-average shares in a loss period", note: "Millions; prior-year quarter. Anti-dilutive potential securities are excluded, so this is not fully diluted future ownership." }, margin: null, fundedBacklog: null, fundingQuestion: "Reconcile full project costs, fuel, restricted cash, financing terms and potential shares. Historical burn cannot establish full-project funding or a guaranteed runway.", milestones: [{ label: "First-of-a-kind commercial authorisations and qualified fuel", kind: "research_required", date: null, note: "This pack does not verify current design/site-specific operating authorisations; regulatory engagement is not commercial operation." }, { label: "Fully financed plant and binding offtake", kind: "research_required", date: null, note: "Verify each contract, conditions and committed funding before assigning project value." }] },
  { symbol: "ROK", name: "Rockwell Automation", themes: ["automation"], stage: "operating_supplier", sourceTitle: "Rockwell Automation fiscal Q3 2026 results · issuer release", sourceUrl: "https://www.rockwellautomation.com/en-se/company/news/press-releases/Rockwell-Automation-Reports-Third-Quarter-2026-Results.html", publishedOn: "2026-08-04", checkedOn: THEME_RESEARCH_CHECKED_ON, periodLabel: "Fiscal Q3 2026 · quarter ended 30 June", exposure: "Industrial automation, controls and software; industry cyclicality and integration economics still matter.", metrics: [quarter("Sales", 2313), quarter("Income before tax", 470), quarter("GAAP pre-tax margin", 20.3, "%"), quarter("Enterprise operating margin", 22.3, "%", "company-defined", "Non-GAAP; different from pre-tax margin."), quarter("Operating cash flow", 724)], shares: { current: 111.6, previous: 113.0, end: "2026-06-30", basis: "Quarterly diluted weighted-average shares", note: "Millions; prior-year quarter. Repurchases do not guarantee future per-share growth." }, margin: { numerator: 470, denominator: 2313, label: "Derived GAAP pre-tax margin" }, fundedBacklog: null, fundingQuestion: "Test customer project budgets, cyclicality and capital allocation rather than annualising a strong quarter's cash flow.", milestones: [{ label: "Organic ARR growth reported: 6% year on year", kind: "reported", date: "2026-06-30", note: "Company-defined organic ARR, not recognised revenue or a measured AI causal effect." }, { label: "Realised customer returns and recurring revenue quality", kind: "research_required", date: null, note: "Verify retention, paid workflow integration and customer outcomes." }] },
];

function researchDate(value: unknown): number {
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return NaN;
  const time = Date.parse(value);
  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(time) && Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === value.slice(0, 10) ? time : NaN;
}

export function companyResearchStatus(company: ThemeCompany, asOf: string): "dated_evidence" | "review_due" | "unavailable" {
  const time = researchDate(asOf);
  const published = researchDate(company.publishedOn);
  const checked = researchDate(company.checkedOn);
  if (![time, published, checked].every(Number.isFinite) || checked < published || time < published || time < checked) return "unavailable";
  return time - published > 120 * 86_400_000 || time - checked > 90 * 86_400_000 ? "review_due" : "dated_evidence";
}

export function companyDerivedMetrics(company: ThemeCompany) {
  const shares = company.shares;
  return { marginPercent: company.margin && [company.margin.numerator, company.margin.denominator].every(Number.isFinite) && company.margin.denominator > 0 ? company.margin.numerator / company.margin.denominator * 100 : null, shareCountChangePercent: shares && [shares.current, shares.previous].every(Number.isFinite) && shares.current > 0 && shares.previous > 0 ? (shares.current / shares.previous - 1) * 100 : null };
}

export function companyMilestoneStatus(milestone: CompanyMilestone, company: ThemeCompany, asOf: string): string {
  if (companyResearchStatus(company, asOf) === "unavailable") return "Not available at this research date";
  if (milestone.kind === "research_required") return "Requires verification";
  if (milestone.kind === "reported") return milestone.date && researchDate(milestone.date) <= researchDate(company.publishedOn) ? "Reported in dated source" : "Reported date requires verification";
  return milestone.date && researchDate(asOf) >= researchDate(milestone.date) + 86_400_000 ? "Target date passed · achievement unverified" : "Management target · not achieved evidence";
}

export const VALUATION_RULES = {
  entryMultiple: { label: "Illustrative entry P/E", min: 5, max: 100, step: 1, unit: "×" },
  exitMultiple: { label: "Assumed exit P/E", min: 5, max: 100, step: 1, unit: "×" },
  earningsGrowth: { label: "Aggregate earnings growth", min: -20, max: 40, step: 1, unit: "% / year" },
  shareGrowth: { label: "Share-count growth / dilution", min: -5, max: 20, step: 0.5, unit: "% / year" },
  years: { label: "Holding period", min: 1, max: 10, step: 1, unit: "years" },
  requiredReturn: { label: "Required annual price change", min: 0, max: 25, step: 0.5, unit: "% / year" },
} as const;
export type ValuationKey = keyof typeof VALUATION_RULES;
export type ValuationInputs = Record<ValuationKey, number>;
export const DEFAULT_VALUATION_INPUTS: ValuationInputs = { entryMultiple: 35, exitMultiple: 25, earningsGrowth: 10, shareGrowth: 1, years: 5, requiredReturn: 8 };

export function runThemeValuation(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Valuation assumptions must be an object.");
  const values = input as Record<string, unknown>;
  if (Object.keys(values).some(key => !Object.hasOwn(VALUATION_RULES, key))) throw new Error("Unknown valuation assumption.");
  const assumptions = {} as ValuationInputs;
  for (const key of Object.keys(VALUATION_RULES) as ValuationKey[]) {
    const rule = VALUATION_RULES[key];
    const value = values[key];
    if (!Object.hasOwn(values, key) || typeof value !== "number" || !Number.isFinite(value) || value < rule.min || value > rule.max || key === "years" && !Number.isInteger(value)) throw new Error(`Invalid ${key}.`);
    assumptions[key] = value;
  }
  const earningsFactor = Math.pow(1 + assumptions.earningsGrowth / 100, assumptions.years);
  const shareFactor = Math.pow(1 + assumptions.shareGrowth / 100, assumptions.years);
  const multipleFactor = assumptions.exitMultiple / assumptions.entryMultiple;
  const priceFactor = earningsFactor / shareFactor * multipleFactor;
  const annualPriceChange = (Math.pow(priceFactor, 1 / assumptions.years) - 1) * 100;
  const requiredAggregateGrowth = ((1 + assumptions.requiredReturn / 100) * (1 + assumptions.shareGrowth / 100) * Math.pow(assumptions.entryMultiple / assumptions.exitMultiple, 1 / assumptions.years) - 1) * 100;
  return { version: HORIZON_THEMES_VERSION, assumptions, earningsFactor, shareFactor, multipleFactor, priceFactor, annualPriceChange, requiredAggregateGrowth, meetsRequiredChange: annualPriceChange + 1e-9 >= assumptions.requiredReturn };
}

export interface ThemeTrendRow {
  symbol: string;
  runDate: string;
  lastCloseDate: string | null;
  lastClose: number | null;
  dailyTrend: number | null;
  weeklyTrend: number | null;
  adjusted: boolean;
}

export function themeTrendContext(rows: ThemeTrendRow[], symbol: string, status: string, asOf: string) {
  const unavailable = (state: "unavailable" | "not_covered" | "stale" | "warming") => ({ state, label: state === "not_covered" ? "Not in this scan" : state === "stale" ? "Stale scan or close" : state === "warming" ? "Trend not fully formed" : "Trend unavailable", row: null });
  if (status !== "live" || !Number.isFinite(researchDate(asOf))) return unavailable("unavailable");
  const matches = rows.filter(row => row.symbol === symbol);
  if (!matches.length) return unavailable("not_covered");
  if (matches.length !== 1) return unavailable("unavailable");
  const row = matches[0];
  const dates = [row.runDate, row.lastCloseDate].map(researchDate);
  const now = researchDate(asOf);
  if (dates.some(date => !Number.isFinite(date) || date > now || now - date > 5 * 86_400_000) || dates[1] > dates[0] + 86_400_000) return unavailable("stale");
  if (!Number.isFinite(row.lastClose) || row.lastClose === null || row.lastClose <= 0) return unavailable("unavailable");
  if (![1, -1].includes(row.dailyTrend ?? 0) || ![1, -1].includes(row.weeklyTrend ?? 0)) return unavailable("warming");
  return { state: "available" as const, label: `Daily ${row.dailyTrend === 1 ? "↑" : "↓"} · weekly ${row.weeklyTrend === 1 ? "↑" : "↓"}`, row: { ...row } };
}
