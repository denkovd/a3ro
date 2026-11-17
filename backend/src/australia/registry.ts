/**
 * Australia Watch indicator registry — the single place an indicator is defined.
 *
 * Adding an indicator = adding one entry here (plus a parser fixture/test).
 * Source, display, freshness, history and page placement all read from this.
 * See docs/australia-watch-upgrade-plan.md for the pillar / role model.
 */

export type AustraliaFrequency = "monthly" | "quarterly";
export type AustraliaPillar = "financial" | "housing" | "labour" | "demand" | "external" | "inflation" | "composite";
export type AustraliaRole = "leading" | "coincident" | "lagging";
export type AustraliaSourceKind = "abs_sdmx";
/** What the chart, z-score and direction are computed on. */
export type AustraliaTransform = "level" | "yoy_from_level";
/** Primary series appear in the main grid; comparison series sit lower on the page and are excluded from any summary. */
export type AustraliaSection = "primary" | "comparison";
export type AustraliaReleaseFamily = "cpi" | "labour";

export interface AustraliaIndicatorDef {
  title: string;
  label: string;
  shortLabel: string;
  subtitle: string;
  pillar: AustraliaPillar;
  role: AustraliaRole;
  section: AustraliaSection;
  order: number;
  source: AustraliaSourceKind;
  dataflow: string;
  key: string;
  frequency: AustraliaFrequency;
  adjustment: string;
  unit: string;
  unitMultiplier: number | null;
  transform: AustraliaTransform;
  /** Observations of the source series requested on each refresh. */
  rollingPeriods: number;
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
  note?: string;
}

export const AUSTRALIA_REGISTRY = {
  monthly_headline_cpi_yoy: {
    title: "Monthly CPI — headline annual change", label: "Headline inflation", shortLabel: "Headline CPI",
    subtitle: "Monthly · original · RBA target measure",
    pillar: "inflation", role: "lagging", section: "primary", order: 10,
    source: "abs_sdmx", dataflow: "ABS,CPI,2.0.0", key: "3.10001.10.50.M",
    frequency: "monthly", adjustment: "Original", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 36, releaseLagDays: 29, releaseFamily: "cpi",
    targetBand: [2, 3], growthPolarity: 0, inflationPolarity: 1,
    note: "The complete Monthly CPI begins in April 2024, so annual change starts April 2025. A historical norm is withheld until 36 prior months exist.",
  },
  monthly_trimmed_mean_cpi_yoy: {
    title: "Monthly CPI — trimmed mean annual change", label: "Trimmed-mean inflation", shortLabel: "Trimmed mean CPI",
    subtitle: "Monthly · seasonally adjusted · underlying inflation",
    pillar: "inflation", role: "lagging", section: "primary", order: 20,
    source: "abs_sdmx", dataflow: "ABS,CPI,2.0.0", key: "3.999902.20.50.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: null, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 36, releaseLagDays: 29, releaseFamily: "cpi",
    growthPolarity: 0, inflationPolarity: 1,
    note: "The complete Monthly CPI begins in April 2024, so annual change starts April 2025. A historical norm is withheld until 36 prior months exist.",
  },
  unemployment_rate: {
    title: "Unemployment rate", label: "Unemployment rate", shortLabel: "Unemployment",
    subtitle: "Monthly · seasonally adjusted",
    pillar: "labour", role: "lagging", section: "primary", order: 30,
    source: "abs_sdmx", dataflow: "ABS,LF,1.0.0", key: "M13.3.1599.20.AUS.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: 0, transform: "level",
    rollingPeriods: 132, baselineYears: 10, minimumBaseline: 60, releaseLagDays: 21, releaseFamily: "labour",
    growthPolarity: -1, inflationPolarity: 0,
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
