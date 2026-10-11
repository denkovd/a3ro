/* ────────────────────────────────────────────────────────────────
   Oil Tracker terminal — shared types for the intel rail.
   Client-safe: no backend value imports.
──────────────────────────────────────────────────────────────── */

import type { Benchmark, CorridorId } from "@a3ro/oil-backend";

export type CorridorStatus = "live" | "connecting" | "watchlist" | "stale";

export type FocusTarget =
  | { kind: "corridor"; id: string }
  | { kind: "benchmark"; id: Benchmark }
  | { kind: "refinery"; id: string }
  | { kind: "route"; id: string }
  | { kind: "gate"; id: CorridorId }
  | { kind: "producer"; id: string };

export type BenchmarkRow = {
  id: Benchmark;
  title: string;
  price: number | null;
  /** Fraction change vs prior daily close (not necessarily day-over-day). */
  changePct: number | null;
  /** YYYY-MM-DD of the prior close used for changePct, when known. */
  changeVsDate: string | null;
  statusText: string;
  statusColor: string;
  suspect: boolean;
  observedAt: string | null;
  refreshFailed: boolean;
  basis: string;
};

export type CorridorWatchRow = {
  id: string;
  title: string;
  status: CorridorStatus;
  statusText: string;
  railMetric?: string;
  healthRatio?: number | null;
  rankScore: number;
};

export type OilIntelligence = {
  benchmarks: BenchmarkRow[];
  corridors: CorridorWatchRow[];
  feedStatus: "loading" | "ready" | "error";
};

/** Static corridor index rows (map hotspots) — order is display fallback only;
    runtime ranking is by rankScore in useOilIntelligence. */
export type CorridorMeta = {
  id: string;
  title: string;
  /** Live-capable free-tier corridor (may still be connecting). */
  liveCapable: boolean;
  /** Has honest watchlist copy (no free live source). */
  watchlist: boolean;
  /** Gate corridor id for PortWatch baselines, when applicable. */
  gateCorridor?: "hormuz" | "singapore" | "usgulf";
};

export const CORRIDOR_META: CorridorMeta[] = [
  { id: "hormuz", title: "Strait of Hormuz", liveCapable: true, watchlist: false, gateCorridor: "hormuz" },
  { id: "sg", title: "Singapore Strait", liveCapable: true, watchlist: false, gateCorridor: "singapore" },
  { id: "usgc", title: "US Gulf Exports", liveCapable: true, watchlist: false, gateCorridor: "usgulf" },
  { id: "china", title: "China · East Coast", liveCapable: false, watchlist: true },
  { id: "ara", title: "ARA · Rotterdam", liveCapable: false, watchlist: true },
];

export const BENCH_TITLE: Record<Benchmark, string> = {
  WTI: "WTI Crude",
  BRENT: "Brent Crude",
};

/** Desktop intel rail width (px) — map stage pads by this amount. */
export const RAIL_WIDTH_PX = 380;
