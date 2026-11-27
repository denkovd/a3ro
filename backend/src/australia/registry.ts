/**
 * Australia Watch indicator registry — the single place an indicator is defined.
 *
 * Adding an indicator = adding one entry here (plus a parser fixture/test).
 * Source, display, freshness, history and page placement all read from this.
 * See docs/australia-watch-upgrade-plan.md for the pillar / role model.
 */

export type AustraliaFrequency = "monthly" | "quarterly";
export type AustraliaPillar = "stress" | "financial" | "housing" | "labour" | "demand" | "external" | "inflation" | "composite";
export type AustraliaRole = "leading" | "coincident" | "lagging";
export type AustraliaSourceKind = "abs_sdmx" | "rba_csv" | "oecd_sdmx" | "apra_xlsx" | "aemo_csv" | "asic_xlsx";
/** What the chart, z-score and direction are computed on. */
export type AustraliaTransform = "level" | "yoy_from_level";
/** Primary series appear in the main grid; comparison series sit lower on the page and are excluded from any summary. */
export type AustraliaSection = "primary" | "comparison";
export type AustraliaReleaseFamily = "cpi" | "labour" | "rba" | "approvals" | "job_vacancies" | "household_spending" | "trade" | "ppi" | "import_prices" | "wpi" | "lending" | "dwelling_values" | "national_accounts" | "oecd" | "apra" | "aemo" | "asic";
/** How the headline value is printed. */
export type AustraliaDisplay = "percent" | "percentage_points" | "index" | "hours_millions" | "count" | "thousands" | "aud_millions" | "aud_thousands";

/** One column of an RBA statistical table, by its "Series ID". */
export interface RbaSeriesRef { table: string; seriesId: string }
/**
 * RBA series spec. "series": one column. "spread": a minus b, matched by month (both must exist).
 * "monthly_average": daily column averaged per calendar month; the month containing the
 * latest daily observation is incomplete and is never stored.
 */
export type RbaSpec =
  | { kind: "series"; ref: RbaSeriesRef }
  | { kind: "spread"; a: RbaSeriesRef; b: RbaSeriesRef }
  | { kind: "monthly_average"; ref: RbaSeriesRef };

interface AustraliaIndicatorBase {
  title: string;
  label: string;
  shortLabel: string;
  subtitle: string;
  pillar: AustraliaPillar;
  role: AustraliaRole;
  section: AustraliaSection;
  order: number;
  frequency: AustraliaFrequency;
  adjustment: string;
  unit: string;
  unitMultiplier: number | null;
  transform: AustraliaTransform;
  /** Observations of the source series requested on each refresh. */
  rollingPeriods: number;
  /** Typical lead over the cycle, from the literature — shown as "typical, not measured". */
  typicalLeadMonths?: readonly [number, number];
  /** Upper bound of the descriptive baseline window. */
  baselineYears: number;
  /** Minimum prior points before a norm (mean, sd, z) is shown. */
  minimumBaseline: number;
  /** Estimated days from reference-period end to publication; fallback only when the ABS calendar is unavailable. */
  releaseLagDays: number;
  releaseFamily: AustraliaReleaseFamily;
  /** RBA 2–3% reference band drawn on the chart. */
  targetBand?: readonly [number, number];
  /** +1: rising = stronger growth; -1: rising = weaker; 0: not a growth signal. */
  growthPolarity: 1 | -1 | 0;
  /** +1: rising = more price pressure; 0: not an inflation signal. */
  inflationPolarity: 1 | -1 | 0;
  /** Shown as a tile on the landing card and Macro Horizon (kept to a handful). */
  summaryTile?: boolean;
  /** The series moves in steps of this size (RBA decisions move the cash rate 0.25). Data health then treats a move of
   *  up to two steps in one period as normal and flags only larger ones, instead of comparing against the usual
   *  month-to-month move, which is near zero for a series that is flat between decisions. */
  stepSize?: number;
  /** How the headline value is printed (default "percent"). */
  display?: AustraliaDisplay;
  decimals?: number;
  note?: string;
}

export interface AbsIndicatorDef extends AustraliaIndicatorBase { source: "abs_sdmx"; dataflow: string; key: string }
export interface RbaIndicatorDef extends AustraliaIndicatorBase { source: "rba_csv"; rba: RbaSpec }
/** OECD SDMX: same SDMX-CSV shape as the ABS. `dataflow` ends in "," to request the latest version. */
export interface OecdIndicatorDef extends AustraliaIndicatorBase { source: "oecd_sdmx"; dataflow: string; key: string }
/** APRA quarterly ADI property exposures workbook (#89): a row of Table 1b as a share of another row. */
export interface ApraIndicatorDef extends AustraliaIndicatorBase { source: "apra_xlsx"; numerator: RegExp; denominator: RegExp }
/** AEMO NEM price and demand files (#90): demand-weighted monthly average spot price across the five regions. */
export interface AemoIndicatorDef extends AustraliaIndicatorBase { source: "aemo_csv" }
/** ASIC insolvency statistics (#91): Series 1 monthly, national total or one industry. */
export interface AsicIndicatorDef extends AustraliaIndicatorBase { source: "asic_xlsx"; industry: RegExp | null }
export type AustraliaIndicatorDef = AbsIndicatorDef | RbaIndicatorDef | OecdIndicatorDef | ApraIndicatorDef | AemoIndicatorDef | AsicIndicatorDef;

export const RBA_TABLE_URL = (table: string) => `https://www.rba.gov.au/statistics/tables/csv/${table}-data.csv`;
const F11 = "f1.1", F21 = "f2.1", F3 = "f3", F6 = "f6", F111 = "f11.1", I2 = "i2", D1 = "d1";

export const AUSTRALIA_REGISTRY = {
  monthly_headline_cpi_yoy: {
    title: "Monthly CPI — headline annual change", label: "Headline inflation", shortLabel: "Headline CPI",
    subtitle: "Monthly · original · RBA target measure",
    pillar: "inflation", role: "lagging", section: "primary", order: 10,
    source: "abs_sdmx", dataflow: "ABS,CPI,2.0.0", key: "3.10001.10.50.M",
    frequency: "monthly", adjustment: "Original", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 36, releaseLagDays: 29, releaseFamily: "cpi",
    targetBand: [2, 3], summaryTile: true, growthPolarity: 0, inflationPolarity: 1,
    note: "The complete Monthly CPI begins in April 2024, so annual change starts April 2025. A historical norm is withheld until 36 prior months exist.",
  },
  monthly_trimmed_mean_cpi_yoy: {
    title: "Monthly CPI — trimmed mean annual change", label: "Trimmed-mean inflation", shortLabel: "Trimmed mean CPI",
    subtitle: "Monthly · seasonally adjusted · underlying inflation",
    pillar: "inflation", role: "lagging", section: "primary", order: 20,
    source: "abs_sdmx", dataflow: "ABS,CPI,2.0.0", key: "3.999902.20.50.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 36, releaseLagDays: 29, releaseFamily: "cpi",
    summaryTile: true, growthPolarity: 0, inflationPolarity: 1,
    note: "The complete Monthly CPI begins in April 2024, so annual change starts April 2025. A historical norm is withheld until 36 prior months exist.",
  },
  unemployment_rate: {
    title: "Unemployment rate", label: "Unemployment rate", shortLabel: "Unemployment",
    subtitle: "Monthly · seasonally adjusted",
    pillar: "labour", role: "lagging", section: "primary", order: 30,
    source: "abs_sdmx", dataflow: "ABS,LF,1.0.0", key: "M13.3.1599.20.AUS.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: 0, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 21, releaseFamily: "labour",
    summaryTile: true, growthPolarity: -1, inflationPolarity: 0,
  },
  hours_worked: {
    title: "Employed persons — monthly hours worked in all jobs", label: "Hours worked", shortLabel: "Hours",
    subtitle: "Monthly total · chart shows annual growth",
    pillar: "labour", role: "coincident", section: "primary", order: 40,
    source: "abs_sdmx", dataflow: "ABS,LF_HOURS,1.0.0", key: "M18.3.1599.TOT.20.AUS.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Hours", unitMultiplier: 3, transform: "yoy_from_level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 21, releaseFamily: "labour",
    growthPolarity: 1, inflationPolarity: 0,
  },
  trimmed_mean_cpi_yoy: {
    title: "Trimmed mean CPI — annual change (quarterly)", label: "Trimmed-mean inflation (quarterly)", shortLabel: "Trimmed mean CPI (Q)",
    subtitle: "Quarterly comparison · seasonally adjusted",
    pillar: "inflation", role: "lagging", section: "comparison", order: 110,
    source: "abs_sdmx", dataflow: "ABS,CPI_Q,1.0.0", key: "3.999902.20.50.Q",
    frequency: "quarterly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 44, baselineYears: 10, minimumBaseline: 20, releaseLagDays: 45, releaseFamily: "cpi",
    growthPolarity: 0, inflationPolarity: 1,
    note: "The ABS keeps quarterly CPI for at least 18 months after the monthly transition (Nov 2025). Shown for continuity with the long history.",
  },
  headline_cpi_yoy: {
    title: "Headline CPI — annual change (quarterly)", label: "Headline inflation (quarterly)", shortLabel: "Headline CPI (Q)",
    subtitle: "Quarterly comparison · seasonally adjusted",
    pillar: "inflation", role: "lagging", section: "comparison", order: 120,
    source: "abs_sdmx", dataflow: "ABS,CPI_Q,1.0.0", key: "3.999901.20.50.Q",
    frequency: "quarterly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 44, baselineYears: 10, minimumBaseline: 20, releaseLagDays: 45, releaseFamily: "cpi",
    targetBand: [2, 3], growthPolarity: 0, inflationPolarity: 1,
    note: "The ABS keeps quarterly CPI for at least 18 months after the monthly transition (Nov 2025). Shown for continuity with the long history.",
  },

  // ── Phase 2: ABS activity, labour and price pipeline ──────────────────────
  // Keys confirmed against data.api.abs.gov.au on 18 Nov 2026.
  dwelling_approvals: {
    title: "Dwelling units approved — total", label: "Dwelling approvals", shortLabel: "Dwelling approvals",
    subtitle: "Monthly · original · chart shows annual growth · ABS Building Approvals",
    pillar: "housing", role: "leading", section: "primary", order: 400, typicalLeadMonths: [6, 12],
    source: "abs_sdmx", dataflow: "ABS,BA_GCCSA,1.0.0", key: "1.1.9.TOT.100.10.AUS.M",
    frequency: "monthly", adjustment: "Original", unit: "Number", unitMultiplier: 0, transform: "yoy_from_level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 40, releaseFamily: "approvals",
    growthPolarity: 1, inflationPolarity: 0, display: "count", decimals: 0,
    note: "The ABS API publishes approvals unadjusted only; annual growth compares the same month a year earlier, which removes most seasonality. Apartment approvals make single months volatile.",
  },
  private_house_approvals: {
    title: "Private sector houses approved", label: "Private house approvals", shortLabel: "House approvals",
    subtitle: "Monthly · original · chart shows annual growth · ABS Building Approvals",
    pillar: "housing", role: "leading", section: "primary", order: 410, typicalLeadMonths: [6, 12],
    source: "abs_sdmx", dataflow: "ABS,BA_GCCSA,1.0.0", key: "1.1.1.TOT.110.10.AUS.M",
    frequency: "monthly", adjustment: "Original", unit: "Number", unitMultiplier: 0, transform: "yoy_from_level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 40, releaseFamily: "approvals",
    growthPolarity: 1, inflationPolarity: 0, display: "count", decimals: 0,
    note: "Private houses are the steadier approvals series and the one most watched as a lead on residential building.",
  },
  housing_lending_commitments: {
    title: "New housing loan commitments — value (excl. refinancing)", label: "Housing loan commitments", shortLabel: "Housing lending",
    subtitle: "Quarterly · seasonally adjusted · chart shows annual growth · ABS Lending Indicators",
    pillar: "housing", role: "leading", section: "primary", order: 420, typicalLeadMonths: [3, 9],
    source: "abs_sdmx", dataflow: "ABS,LEND_HOUSING,1.1", key: "FIN_VAL.NEWCOMMITS.DV8368.TOTDWELL.TOT.TOT.20.AUS.Q",
    frequency: "quarterly", adjustment: "Seasonally Adjusted", unit: "Australian Dollars", unitMultiplier: 6, transform: "yoy_from_level",
    rollingPeriods: 44, baselineYears: 10, minimumBaseline: 20, releaseLagDays: 42, releaseFamily: "lending",
    growthPolarity: 1, inflationPolarity: 1, display: "aud_millions", decimals: 0,
    note: "The ABS moved Lending Indicators to a quarterly release in 2026.",
  },
  // ── Rates and housing (#28) — open data only; keys confirmed against the ABS API and RBA F6 on 23 Nov 2026 ──
  dwelling_mean_price: {
    title: "Mean price of residential dwellings — Australia", label: "Mean dwelling price", shortLabel: "Dwelling price",
    subtitle: "Quarterly · A$ thousands · chart shows annual growth · ABS Total Value of Dwellings",
    pillar: "housing", role: "coincident", section: "primary", order: 430,
    source: "abs_sdmx", dataflow: "ABS,RES_DWELL_ST,1.0.0", key: "5.AUS.Q",
    frequency: "quarterly", adjustment: "Original", unit: "Australian Dollars", unitMultiplier: 3, transform: "yoy_from_level",
    rollingPeriods: 44, baselineYears: 10, minimumBaseline: 20, releaseLagDays: 70, releaseFamily: "dwelling_values",
    growthPolarity: 0, inflationPolarity: 0, display: "aud_thousands", decimals: 0,
    note: "Mean of all residential dwellings, so it shifts with the mix of what exists, not only with prices. Cotality's hedonic home value index is more timely but needs a licence.",
  },
  cpi_rents_yoy: {
    title: "CPI rents — annual change", label: "Rents (CPI)", shortLabel: "Rents",
    subtitle: "Monthly · % change from a year earlier · ABS Monthly CPI",
    pillar: "housing", role: "lagging", section: "primary", order: 440,
    source: "abs_sdmx", dataflow: "ABS,CPI,2.0.0", key: "3.115522.10.50.M",
    frequency: "monthly", adjustment: "Original", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 36, releaseLagDays: 29, releaseFamily: "cpi",
    growthPolarity: 0, inflationPolarity: 0, decimals: 1,
    note: "Rents paid by tenants, a slow-moving part of CPI. Kept out of the Pulse inflation count so CPI isn't counted twice. Monthly history starts in 2023.",
  },
  mortgage_rate_new_variable: {
    title: "Mortgage rate — new owner-occupier variable loans", label: "New mortgage rate (variable)", shortLabel: "Mortgage rate",
    subtitle: "Monthly · % · new loans funded in the month · RBA F6",
    pillar: "housing", role: "coincident", section: "primary", order: 450,
    source: "rba_csv", rba: { kind: "series", ref: { table: F6, seriesId: "FLRHOFVA" } },
    frequency: "monthly", adjustment: "Original", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 40, releaseFamily: "rba",
    growthPolarity: -1, inflationPolarity: 0, decimals: 2,
    note: "The average rate actually charged on new owner-occupier variable loans across all lenders, not an advertised rate.",
  },
  job_vacancies: {
    title: "Job vacancies — total", label: "Job vacancies", shortLabel: "Job vacancies",
    subtitle: "Quarterly · seasonally adjusted · chart shows annual growth · ABS Job Vacancies",
    pillar: "labour", role: "leading", section: "primary", order: 50, typicalLeadMonths: [3, 6],
    source: "abs_sdmx", dataflow: "ABS,JV,1.0", key: "M1.7.TOT.20.AUS.Q",
    frequency: "quarterly", adjustment: "Seasonally Adjusted", unit: "Number", unitMultiplier: 3, transform: "yoy_from_level",
    rollingPeriods: 44, baselineYears: 10, minimumBaseline: 20, releaseLagDays: 40, releaseFamily: "job_vacancies",
    growthPolarity: 1, inflationPolarity: 1, display: "thousands", decimals: 1,
    note: "Surveyed in the middle month of each quarter (e.g. August for the September quarter).",
  },
  underemployment_rate: {
    title: "Underemployment rate", label: "Underemployment rate", shortLabel: "Underemployment",
    subtitle: "Monthly · seasonally adjusted · share of the labour force",
    pillar: "labour", role: "leading", section: "primary", order: 60, typicalLeadMonths: [3, 6],
    source: "abs_sdmx", dataflow: "ABS,LF_UNDER,1.0.1", key: "M23.3.1599.20.AUS.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: 0, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 21, releaseFamily: "labour",
    growthPolarity: -1, inflationPolarity: -1,
    note: "Employed people who want and are available for more hours. It tends to turn before the unemployment rate.",
  },
  household_spending_yoy: {
    title: "Household spending — annual growth", label: "Household spending", shortLabel: "Household spending",
    subtitle: "Monthly · seasonally adjusted · current prices · ABS Monthly Household Spending Indicator",
    pillar: "demand", role: "coincident", section: "primary", order: 500,
    source: "abs_sdmx", dataflow: "ABS,HSI_M,1.6.0", key: "9.TOT.CUR.20.AUS.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: 0, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 36, releaseFamily: "household_spending",
    growthPolarity: 1, inflationPolarity: 1,
    note: "Current prices, so it includes inflation: with headline CPI near 4%, part of this growth is price, not volume.",
  },
  trade_balance_goods: {
    title: "Balance on goods trade", label: "Goods trade balance", shortLabel: "Trade balance",
    subtitle: "Monthly · seasonally adjusted · A$ million · ABS International Trade in Goods",
    pillar: "external", role: "coincident", section: "primary", order: 310,
    source: "abs_sdmx", dataflow: "ABS,ITGS,1.2.0", key: "M1.170.20.AUS.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Australian Dollars", unitMultiplier: 6, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 36, releaseFamily: "trade",
    growthPolarity: 1, inflationPolarity: 0, display: "aud_millions", decimals: 0,
  },
  ppi_final_demand_yoy: {
    title: "Producer prices — final demand, annual change", label: "Producer prices (final demand)", shortLabel: "PPI",
    subtitle: "Quarterly · excludes exports · ABS Producer Price Indexes",
    pillar: "inflation", role: "leading", section: "primary", order: 70, typicalLeadMonths: [3, 9],
    source: "abs_sdmx", dataflow: "ABS,PPI_FD,1.1.0", key: "3.TOT.TOT.TOTXE.Q",
    frequency: "quarterly", adjustment: "Original", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 44, baselineYears: 10, minimumBaseline: 20, releaseLagDays: 32, releaseFamily: "ppi",
    growthPolarity: 0, inflationPolarity: 1,
    note: "Prices businesses receive for goods and services sold to domestic final demand; pressure here tends to pass into consumer prices.",
  },
  import_prices_yoy: {
    title: "Import price index — annual change", label: "Import prices", shortLabel: "Import prices",
    subtitle: "Quarterly · all groups · A$ terms · ABS International Trade Price Indexes",
    pillar: "inflation", role: "leading", section: "primary", order: 80, typicalLeadMonths: [3, 9],
    source: "abs_sdmx", dataflow: "ABS,ITPI_IMP,1.0.0", key: "3.6011001.Q",
    frequency: "quarterly", adjustment: "Original", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 44, baselineYears: 10, minimumBaseline: 20, releaseLagDays: 31, releaseFamily: "import_prices",
    growthPolarity: 0, inflationPolarity: 1,
    note: "Measured in Australian dollars, so a weaker AUD lifts it even when world prices are flat.",
  },
  wage_price_index_yoy: {
    title: "Wage Price Index — annual growth", label: "Wage growth (WPI)", shortLabel: "Wages",
    subtitle: "Quarterly · seasonally adjusted · total hourly rates excl. bonuses",
    pillar: "inflation", role: "lagging", section: "primary", order: 90,
    source: "abs_sdmx", dataflow: "ABS,WPI,1.2.0", key: "3.THRPEB.7.TOT.20.AUS.Q",
    frequency: "quarterly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 44, baselineYears: 10, minimumBaseline: 20, releaseLagDays: 50, releaseFamily: "wpi",
    growthPolarity: 0, inflationPolarity: 1,
  },

  // ── Stress watch (roadmap #88–#91) ─────────────────────────────────────────
  // Key from the ANA_AGG structure on data.api.abs.gov.au, 26 Nov 2026: MEASURE M1 (chain volume),
  // DATA_ITEM GPM_PCA (GDP per capita), TSEST 20 (seasonally adjusted), AUS, quarterly.
  gdp_per_capita: {
    title: "Real GDP per capita — annual growth", label: "GDP per capita", shortLabel: "GDP per capita",
    subtitle: "Quarterly · seasonally adjusted · chain volume · ABS National Accounts",
    pillar: "stress", role: "coincident", section: "primary", order: 1500,
    source: "abs_sdmx", dataflow: "ABS,ANA_AGG,1.0.0", key: "M1.GPM_PCA.20.AUS.Q",
    frequency: "quarterly", adjustment: "Seasonally Adjusted", unit: "AUD per person", unitMultiplier: 0, transform: "yoy_from_level",
    rollingPeriods: 48, baselineYears: 10, minimumBaseline: 20, releaseLagDays: 65, releaseFamily: "national_accounts",
    growthPolarity: 1, inflationPolarity: 0, display: "count", decimals: 0,
    note: "Output per person after inflation. Total GDP can grow while GDP per capita falls when population grows faster than the economy, so this shows whether the average Australian's share of output is rising or shrinking. Quarterly figures are dollars of output per person in that quarter (chain volume).",
  },

  housing_npl_share: {
    title: "Non-performing housing loans — share of all housing loans", label: "Mortgages not being repaid", shortLabel: "Non-performing mortgages",
    subtitle: "Quarterly · banks and other lenders (ADIs) · APRA",
    pillar: "stress", role: "lagging", section: "primary", order: 1510,
    source: "apra_xlsx", numerator: /^non-performing loans$/i, denominator: /^total credit out?standing$/i,
    frequency: "quarterly", adjustment: "Original", unit: "Percent", unitMultiplier: 0, transform: "level",
    rollingPeriods: 40, baselineYears: 10, minimumBaseline: 12, releaseLagDays: 80, releaseFamily: "apra",
    growthPolarity: 0, inflationPolarity: 0, display: "percent", decimals: 2,
    note: "Housing loans 90 or more days behind, or unlikely to be repaid in full, as a share of all housing loans held by banks and other deposit-takers. It rises after rates go up and as unemployment rises, and confirms stress rather than predicting it. APRA's quarterly property exposures statistics; series from March 2019, when APRA's reporting changed.",
  },
  housing_arrears_share: {
    title: "Housing loans 30–89 days past due — share of all housing loans", label: "Mortgages falling behind", shortLabel: "Mortgages 30–89 days late",
    subtitle: "Quarterly · banks and other lenders (ADIs) · APRA",
    pillar: "stress", role: "coincident", section: "primary", order: 1520,
    source: "apra_xlsx", numerator: /^loans 30-89 days past due$/i, denominator: /^total credit out?standing$/i,
    frequency: "quarterly", adjustment: "Original", unit: "Percent", unitMultiplier: 0, transform: "level",
    rollingPeriods: 40, baselineYears: 10, minimumBaseline: 12, releaseLagDays: 80, releaseFamily: "apra",
    growthPolarity: 0, inflationPolarity: 0, display: "percent", decimals: 2,
    note: "Borrowers one to three months behind on their mortgage: the early stage of housing stress, before loans become non-performing. Not seasonally adjusted, so it tends to rise after Christmas.",
  },
  power_price_nem: {
    title: "Wholesale electricity price — NEM monthly average", label: "Wholesale power price", shortLabel: "Power price",
    subtitle: "Monthly · demand-weighted average of the five NEM regions · AEMO",
    pillar: "stress", role: "coincident", section: "primary", order: 1530,
    source: "aemo_csv",
    frequency: "monthly", adjustment: "Original", unit: "AUD per MWh", unitMultiplier: 0, transform: "level",
    rollingPeriods: 3, baselineYears: 5, minimumBaseline: 24, releaseLagDays: 2, releaseFamily: "aemo",
    growthPolarity: 0, inflationPolarity: 0, display: "count", decimals: 0,
    note: "The average spot price generators were paid in the National Electricity Market (Queensland, NSW and the ACT, Victoria, South Australia and Tasmania), weighted by demand. Wholesale costs are roughly a third of a household power bill and feed into retail prices with a lag, so a sustained rise points to higher bills and inflation later. Western Australia and the Northern Territory are not in the NEM. Prices are seasonal: higher in winter and in heatwaves.",
  },

  company_insolvencies: {
    title: "Companies entering insolvency — annual change", label: "Company insolvencies", shortLabel: "Insolvencies",
    subtitle: "Monthly · companies entering external administration for the first time · ASIC",
    pillar: "stress", role: "coincident", section: "primary", order: 1540,
    source: "asic_xlsx", industry: null,
    frequency: "monthly", adjustment: "Original", unit: "Companies", unitMultiplier: 0, transform: "yoy_from_level",
    rollingPeriods: 96, baselineYears: 5, minimumBaseline: 24, releaseLagDays: 14, releaseFamily: "asic",
    growthPolarity: 0, inflationPolarity: 0, display: "count", decimals: 0,
    note: "Companies going into liquidation, administration, restructuring or receivership for the first time each month. Charted as the change from the same month a year earlier, because insolvencies are seasonal (low in January). After COVID support ended, numbers climbed from record lows, partly as the tax office resumed chasing debts, so part of the rise is catch-up rather than new stress. Recent months are provisional.",
  },
  insolvencies_construction: {
    title: "Construction companies entering insolvency — annual change", label: "Construction insolvencies", shortLabel: "Construction",
    subtitle: "Monthly · construction industry · ASIC",
    pillar: "stress", role: "coincident", section: "primary", order: 1550,
    source: "asic_xlsx", industry: /^construction$/i,
    frequency: "monthly", adjustment: "Original", unit: "Companies", unitMultiplier: 0, transform: "yoy_from_level",
    rollingPeriods: 96, baselineYears: 5, minimumBaseline: 24, releaseLagDays: 14, releaseFamily: "asic",
    growthPolarity: 0, inflationPolarity: 0, display: "count", decimals: 0,
    note: "The industry with the most insolvencies: fixed-price contracts, rising material and labour costs and long payment chains make builders and subcontractors fragile. By-industry figures start in July 2021.",
  },
  insolvencies_hospitality: {
    title: "Hospitality companies entering insolvency — annual change", label: "Hospitality insolvencies", shortLabel: "Hospitality",
    subtitle: "Monthly · accommodation and food services · ASIC",
    pillar: "stress", role: "coincident", section: "primary", order: 1560,
    source: "asic_xlsx", industry: /^accommodation and food services$/i,
    frequency: "monthly", adjustment: "Original", unit: "Companies", unitMultiplier: 0, transform: "yoy_from_level",
    rollingPeriods: 96, baselineYears: 5, minimumBaseline: 24, releaseLagDays: 14, releaseFamily: "asic",
    growthPolarity: 0, inflationPolarity: 0, display: "count", decimals: 0,
    note: "Cafés, restaurants, pubs and hotels: thin margins and spending that households cut first, so this tends to show household belt-tightening early. By-industry figures start in July 2021.",
  },

  // ── Financial conditions (RBA statistical tables) ──────────────────────────
  cash_rate_target: {
    title: "Cash rate target (monthly average)", label: "Cash rate target", shortLabel: "Cash rate",
    subtitle: "Monthly average · RBA F1.1",
    pillar: "financial", role: "coincident", section: "primary", order: 200,
    source: "rba_csv", rba: { kind: "series", ref: { table: F11, seriesId: "FIRMMCRT" } },
    frequency: "monthly", adjustment: "Original", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 5, releaseFamily: "rba",
    summaryTile: true, growthPolarity: -1, inflationPolarity: -1, decimals: 2, stepSize: 0.25,
    note: "Policy setting, not a forecast. A monthly average, so a mid-month change shows partly in that month.",
  },
  policy_expectations_3y_cash: {
    title: "3-year government bond yield minus cash rate", label: "Rate expectations (3y less cash)", shortLabel: "3y – cash",
    subtitle: "Monthly · percentage points · RBA F2.1, F1.1",
    pillar: "financial", role: "leading", section: "primary", order: 210, typicalLeadMonths: [6, 18],
    source: "rba_csv", rba: { kind: "spread", a: { table: F21, seriesId: "FCMYGBAG3" }, b: { table: F11, seriesId: "FIRMMCRT" } },
    frequency: "monthly", adjustment: "Original", unit: "Percentage points", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 10, releaseFamily: "rba",
    growthPolarity: -1, inflationPolarity: 0, display: "percentage_points", decimals: 2,
    note: "Above zero: bond markets price a higher average cash rate over three years than today; below zero: lower. Also contains a term premium, so it is not a pure rate forecast.",
  },
  yield_curve_10y_3y: {
    title: "Yield curve — 10-year less 3-year government bond", label: "Yield curve (10y less 3y)", shortLabel: "Curve 10y–3y",
    subtitle: "Monthly · percentage points · RBA F2.1",
    pillar: "financial", role: "leading", section: "primary", order: 220, typicalLeadMonths: [6, 18],
    source: "rba_csv", rba: { kind: "spread", a: { table: F21, seriesId: "FCMYGBAG10" }, b: { table: F21, seriesId: "FCMYGBAG3" } },
    frequency: "monthly", adjustment: "Original", unit: "Percentage points", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 10, releaseFamily: "rba",
    summaryTile: true, growthPolarity: 1, inflationPolarity: 0, display: "percentage_points", decimals: 2,
  },
  gov_bond_10y: {
    title: "10-year government bond yield", label: "10-year bond yield", shortLabel: "10y yield",
    subtitle: "Monthly average · RBA F2.1",
    pillar: "financial", role: "coincident", section: "primary", order: 230,
    source: "rba_csv", rba: { kind: "series", ref: { table: F21, seriesId: "FCMYGBAG10" } },
    frequency: "monthly", adjustment: "Original", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 10, releaseFamily: "rba",
    growthPolarity: -1, inflationPolarity: 0, decimals: 2,
  },
  corporate_spread_bbb_3y: {
    title: "BBB corporate bond spread — 3-year", label: "BBB corporate spread (3y)", shortLabel: "BBB spread",
    subtitle: "Monthly · BBB non-financial 3y yield less 3y government · RBA F3, F2.1",
    pillar: "financial", role: "leading", section: "primary", order: 240, typicalLeadMonths: [3, 12],
    source: "rba_csv", rba: { kind: "spread", a: { table: F3, seriesId: "FNFYBBB3M" }, b: { table: F21, seriesId: "FCMYGBAG3" } },
    frequency: "monthly", adjustment: "Original", unit: "Percentage points", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 16, releaseFamily: "rba",
    growthPolarity: -1, inflationPolarity: 0, display: "percentage_points", decimals: 2,
    note: "Our calculation from two RBA tables. F3 targets a 3-year tenor, so the effective tenor can differ slightly from the 3-year government benchmark.",
  },
  housing_credit_growth: {
    title: "Housing credit — 12-month growth", label: "Housing credit growth", shortLabel: "Housing credit",
    subtitle: "Monthly · seasonally adjusted · RBA D1",
    pillar: "financial", role: "leading", section: "primary", order: 250, typicalLeadMonths: [3, 12],
    source: "rba_csv", rba: { kind: "series", ref: { table: D1, seriesId: "DGFACH12" } },
    frequency: "monthly", adjustment: "Seasonally adjusted", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 33, releaseFamily: "rba",
    growthPolarity: 1, inflationPolarity: 1,
    note: "The RBA has warned D-series tables may be delayed while the D2A reporting system is decommissioned.",
  },
  business_credit_growth: {
    title: "Non-financial business credit — 12-month growth", label: "Business credit growth", shortLabel: "Business credit",
    subtitle: "Monthly · seasonally adjusted · RBA D1",
    pillar: "financial", role: "leading", section: "primary", order: 260, typicalLeadMonths: [3, 12],
    source: "rba_csv", rba: { kind: "series", ref: { table: D1, seriesId: "DGFACBNF12" } },
    frequency: "monthly", adjustment: "Seasonally adjusted", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 33, releaseFamily: "rba",
    growthPolarity: 1, inflationPolarity: 1,
    note: "The RBA has warned D-series tables may be delayed while the D2A reporting system is decommissioned.",
  },
  aud_twi: {
    title: "Australian dollar — trade-weighted index", label: "AUD trade-weighted index", shortLabel: "AUD TWI",
    subtitle: "Monthly average of daily values · May 1970 = 100 · RBA F11.1",
    pillar: "financial", role: "leading", section: "primary", order: 270, typicalLeadMonths: [3, 12],
    source: "rba_csv", rba: { kind: "monthly_average", ref: { table: F111, seriesId: "FXRTWI" } },
    frequency: "monthly", adjustment: "Original", unit: "Index", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 36, releaseLagDays: 3, releaseFamily: "rba",
    growthPolarity: -1, inflationPolarity: -1, display: "index", decimals: 1,
    note: "The current RBA daily table starts in January 2023, so the norm is withheld until 36 complete months exist. The month in progress is not shown.",
  },

  // ── External (RBA) ─────────────────────────────────────────────────────────
  commodity_prices_aud: {
    title: "RBA Index of Commodity Prices — A$", label: "Commodity prices (A$)", shortLabel: "Commodities A$",
    subtitle: "Monthly · index 2024/25 = 100 · chart shows annual growth · RBA I2",
    pillar: "external", role: "leading", section: "primary", order: 300, typicalLeadMonths: [3, 12],
    source: "rba_csv", rba: { kind: "series", ref: { table: I2, seriesId: "GRCPAIAD" } },
    frequency: "monthly", adjustment: "Original", unit: "Index", unitMultiplier: null, transform: "yoy_from_level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 4, releaseFamily: "rba",
    growthPolarity: 1, inflationPolarity: 1, display: "index", decimals: 1,
  },

  // ── Composite leading indicators (OECD) ────────────────────────────────────
  // Keys confirmed against sdmx.oecd.org (DSD_STES@DF_CLI v4.1) on 18 Nov 2026.
  oecd_cli: {
    title: "OECD composite leading indicator — Australia", label: "OECD leading indicator", shortLabel: "OECD CLI",
    subtitle: "Monthly · amplitude adjusted · 100 = long-term trend · OECD",
    pillar: "composite", role: "leading", section: "primary", order: 600, typicalLeadMonths: [6, 9],
    source: "oecd_sdmx", dataflow: "OECD.SDD.STES,DSD_STES@DF_CLI,", key: "AUS.M.LI.IX._Z.AA.IX._Z.H",
    frequency: "monthly", adjustment: "Amplitude adjusted", unit: "Index", unitMultiplier: 0, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 20, releaseFamily: "oecd",
    summaryTile: true, growthPolarity: 1, inflationPolarity: 0, display: "index", decimals: 2,
    note: "Above 100 and rising: expansion above trend. Below 100 and falling: slowdown. The OECD revises recent months as components update, so the latest readings move.",
  },
  oecd_consumer_confidence: {
    title: "OECD composite consumer confidence — Australia", label: "Consumer confidence (OECD)", shortLabel: "Consumer conf.",
    subtitle: "Monthly · amplitude adjusted · 100 = long-term average · OECD",
    pillar: "composite", role: "leading", section: "primary", order: 610, typicalLeadMonths: [3, 6],
    source: "oecd_sdmx", dataflow: "OECD.SDD.STES,DSD_STES@DF_CLI,", key: "AUS.M.CCICP.IX._Z.AA.IX._Z.H",
    frequency: "monthly", adjustment: "Amplitude adjusted", unit: "Index", unitMultiplier: 0, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 20, releaseFamily: "oecd",
    growthPolarity: 1, inflationPolarity: 0, display: "index", decimals: 2,
    note: "The OECD's harmonised version of national consumer surveys, so its level is comparable across countries rather than identical to any one survey.",
  },
  oecd_business_confidence: {
    title: "OECD composite business confidence — Australia", label: "Business confidence (OECD)", shortLabel: "Business conf.",
    subtitle: "Monthly · amplitude adjusted · 100 = long-term average · OECD",
    pillar: "composite", role: "leading", section: "primary", order: 620, typicalLeadMonths: [3, 6],
    source: "oecd_sdmx", dataflow: "OECD.SDD.STES,DSD_STES@DF_CLI,", key: "AUS.M.BCICP.IX._Z.AA.IX._Z.H",
    frequency: "monthly", adjustment: "Amplitude adjusted", unit: "Index", unitMultiplier: 0, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 80, releaseFamily: "oecd",
    growthPolarity: 1, inflationPolarity: 0, display: "index", decimals: 2,
    note: "Published about two months behind the other OECD series for Australia. Harmonised from national business surveys.",
  },
} as const satisfies Record<string, AustraliaIndicatorDef>;

export type AustraliaIndicator = keyof typeof AUSTRALIA_REGISTRY;

export const AUSTRALIA_INDICATORS = (Object.keys(AUSTRALIA_REGISTRY) as AustraliaIndicator[])
  .sort((a, b) => AUSTRALIA_REGISTRY[a].order - AUSTRALIA_REGISTRY[b].order);

export function isAustraliaIndicator(value: string): value is AustraliaIndicator {
  return Object.prototype.hasOwnProperty.call(AUSTRALIA_REGISTRY, value);
}

export function indicatorDef(indicator: AustraliaIndicator): AustraliaIndicatorDef {
  return AUSTRALIA_REGISTRY[indicator];
}

export function indicatorsInSection(section: AustraliaSection): AustraliaIndicator[] {
  return AUSTRALIA_INDICATORS.filter((i) => AUSTRALIA_REGISTRY[i].section === section);
}

export const PILLAR_LABEL: Record<AustraliaPillar, string> = {
  stress: "Stress watch",
  inflation: "Inflation", labour: "Labour", financial: "Financial conditions", housing: "Housing & construction",
  demand: "Business & household demand", external: "External", composite: "Composite leading indicators",
};
export const PILLAR_ORDER: AustraliaPillar[] = ["stress", "inflation", "labour", "financial", "housing", "demand", "external", "composite"];

/** Primary indicators grouped by pillar, pillars in PILLAR_ORDER, empty pillars dropped. */
export function primaryByPillar(): { pillar: AustraliaPillar; label: string; indicators: AustraliaIndicator[] }[] {
  const primary = indicatorsInSection("primary");
  return PILLAR_ORDER.map((pillar) => ({ pillar, label: PILLAR_LABEL[pillar], indicators: primary.filter((i) => AUSTRALIA_REGISTRY[i].pillar === pillar) }))
    .filter((g) => g.indicators.length > 0);
}

export function absSpec(indicator: AustraliaIndicator): AbsIndicatorDef {
  const def: AustraliaIndicatorDef = AUSTRALIA_REGISTRY[indicator];
  if (def.source !== "abs_sdmx") throw new Error(`${indicator} is not an ABS series`);
  return def;
}

export function oecdSpec(indicator: AustraliaIndicator): OecdIndicatorDef {
  const def: AustraliaIndicatorDef = AUSTRALIA_REGISTRY[indicator];
  if (def.source !== "oecd_sdmx") throw new Error(`${indicator} is not an OECD series`);
  return def;
}

export function apraSpec(indicator: AustraliaIndicator): ApraIndicatorDef {
  const def: AustraliaIndicatorDef = AUSTRALIA_REGISTRY[indicator];
  if (def.source !== "apra_xlsx") throw new Error(`${indicator} is not an APRA series`);
  return def;
}

export function rbaSpec(indicator: AustraliaIndicator): RbaIndicatorDef {
  const def: AustraliaIndicatorDef = AUSTRALIA_REGISTRY[indicator];
  if (def.source !== "rba_csv") throw new Error(`${indicator} is not an RBA series`);
  return def;
}

/** RBA tables an indicator reads (one or two). */
export function rbaTables(spec: RbaSpec): string[] {
  return spec.kind === "spread" ? [...new Set([spec.a.table, spec.b.table])] : [spec.ref.table];
}
