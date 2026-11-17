import type { AustraliaFrequency, AustraliaIndicator } from "./registry";
export type { AustraliaFrequency, AustraliaIndicator } from "./registry";
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

export interface AustraliaRelease {
  referencePeriod: string;
  releaseAt: string;
}

export interface AustraliaReleaseSchedule {
  sourceUrl: string;
  verifiedAt: string | null;
  latestReferencePeriod: string | null;
  latest: AustraliaRelease | null;
  next: AustraliaRelease | null;
  nextPublication: AustraliaRelease | null;
  health: "healthy" | "unavailable";
}
