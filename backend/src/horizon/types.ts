export type HorizonArea = "capacity" | "households" | "ownership" | "energy";
export type HorizonFrequency = "monthly" | "quarterly" | "annual";
export type HorizonSource = "bls" | "bea" | "dfa";
export type HorizonFreshness = "current" | "aging" | "stale" | "unavailable";

export interface HorizonPoint {
  period: string;
  value: number;
  status: string | null;
}

export interface HorizonIndicator {
  key: string;
  title: string;
  area: HorizonArea;
  source: HorizonSource;
  sourceSeries: string;
  frequency: HorizonFrequency;
  unit: "index" | "percent" | "usd2017";
  adjustment: string;
  population: string;
  basis: string;
  change: "percent" | "percentage_points";
  sourceUrl: string;
  note: string;
}

export interface HorizonDataset {
  source: HorizonSource;
  retrievedAt: string;
  publicationDate: string | null;
  dataUrl: string;
  series: { key: string; points: HorizonPoint[] }[];
}

export interface HorizonSourceState {
  source: HorizonSource;
  health: "healthy" | "degraded" | "unavailable";
  checkedAt: string | null;
  error: string | null;
}

export interface HorizonRead extends HorizonIndicator {
  points: HorizonPoint[];
  latest: HorizonPoint | null;
  annualChange: number | null;
  changeFromPeriod: string | null;
  freshness: HorizonFreshness;
  verifiedAt: string | null;
  publicationDate: string | null;
  dataUrl: string | null;
  sourceHealth: HorizonSourceState["health"];
}

export interface HorizonSnapshot {
  version: 1;
  stage: 1;
  generatedAt: string;
  status: "ready" | "partial" | "unavailable";
  archive: "available" | "unavailable";
  indicators: HorizonRead[];
  sources: HorizonSourceState[];
  coverage: { available: number; current: number; total: number };
}
