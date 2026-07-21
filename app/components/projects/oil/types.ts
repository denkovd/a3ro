/* ────────────────────────────────────────────────────────────────
   Oil Tracker terminal — shared types for the intel rail.
   Client-safe: no backend value imports.
──────────────────────────────────────────────────────────────── */

import type { Benchmark } from "@a3ro/oil-backend";

/** Multi-asset shell hook — only oil is live in this ship. */
export type AssetSurface = "oil" | "gold" | "bitcoin";

export type CorridorStatus = "live" | "connecting" | "watchlist";

export type FocusTarget =
  | { kind: "corridor"; id: string }
  | { kind: "benchmark"; id: Benchmark }
  | { kind: "producer"; id: string };

export type StanceView = {
  status: "loading" | "live" | "pending" | "error";
  stance: string;
  label: string;
  headline: string;
  coverage: number;
};

export type RailDriver = {
  id: string;
  label: string;
  value: string;
  color?: string;
  /** Optional map/rail focus when the chip is clicked. */
  focus?: FocusTarget;
};

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

export type SpreadView = {
  value: number;
  label: string;
};

export type OilIntelligence = {
  stance: StanceView;
  drivers: RailDriver[];
  benchmarks: BenchmarkRow[];
  spread: SpreadView | null;
  corridors: CorridorWatchRow[];
  feedClock: string | null;
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

export const STANCE_COLOR: Record<string, string> = {
  SUPPLY_TIGHT: "#d4a157",
  SUPPLY_AMPLE: "#5fc9a4",
  MACRO_DRIVEN: "#8b9dff",
  BALANCED: "var(--ink-2)",
  PENDING: "var(--ink-3)",
};

/** Desktop intel rail width (px) — map stage pads by this amount. */
export const RAIL_WIDTH_PX = 380;
