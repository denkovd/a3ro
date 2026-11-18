export type DividendArea = "capacity" | "households" | "ownership" | "energy";
export type DividendFrequency = "monthly" | "quarterly" | "annual";
export type DividendSource = "bls" | "bea" | "dfa";
export type DividendFreshness = "current" | "aging" | "stale" | "unavailable";

export interface DividendPoint {
  period: string;
  value: number;
  status: string | null;
}

export interface DividendIndicator {
  key: string;
  title: string;
  area: DividendArea;
  source: DividendSource;
  sourceSeries: string;
  frequency: DividendFrequency;
  unit: "index" | "percent" | "usd2017";
  adjustment: string;
  population: string;
  basis: string;
  change: "percent" | "percentage_points";
  sourceUrl: string;
  note: string;
}

export interface DividendDataset {
  source: DividendSource;
  retrievedAt: string;
  publicationDate: string | null;
  dataUrl: string;
  series: { key: string; points: DividendPoint[] }[];
}

export interface DividendSourceState {
  source: DividendSource;
  health: "healthy" | "degraded" | "unavailable";
  checkedAt: string | null;
  error: string | null;
}

export interface DividendRead extends DividendIndicator {
  points: DividendPoint[];
  latest: DividendPoint | null;
  annualChange: number | null;
  changeFromPeriod: string | null;
  freshness: DividendFreshness;
  verifiedAt: string | null;
  publicationDate: string | null;
  dataUrl: string | null;
  sourceHealth: DividendSourceState["health"];
}

export interface DividendSnapshot {
  version: 1;
  stage: 1;
  generatedAt: string;
  status: "ready" | "partial" | "unavailable";
  archive: "available" | "unavailable";
  indicators: DividendRead[];
  sources: DividendSourceState[];
  coverage: { available: number; current: number; total: number };
}
