export type AustraliaIndicator = "trimmed_mean_cpi_yoy" | "headline_cpi_yoy" | "unemployment_rate" | "hours_worked";
export type AustraliaFrequency = "monthly" | "quarterly";
export type ObservationFreshness = "fresh" | "aging" | "stale" | "unavailable";
export type FetchHealth = "healthy" | "degraded" | "unavailable" | "never_attempted";

export interface AustraliaObservation {
  indicator: AustraliaIndicator;
  title: string;
  value: number;
  unit: string;
  unitMultiplier: number | null;
  frequency: AustraliaFrequency;
  adjustment: string;
  referencePeriod: string;
  sourceUrl: string;
  publicationDate: string | null;
  sourceStatus: string | null;
  sourceComment: string | null;
  firstRetrievedAt: string;
  lastVerifiedAt: string;
}

export interface AustraliaFetchState {
  health: FetchHealth;
  retrievedAt: string | null;
  error: string | null;
}
