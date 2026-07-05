/* ────────────────────────────────────────────────────────────────
   Corridor metrics — canonical domain types.
   Sibling to core/types.ts (price domain): everything that crosses
   a module boundary for corridor data is defined here. Adapters
   normalize INTO these shapes; nothing downstream ever sees a
   source's native payload.

   A "corridor" is a chokepoint/region we track (Hormuz, China
   demand, Singapore, ARA, US Gulf); a "metric" is one named signal
   within that corridor (crude_exports, refinery_utilization, …).
   Unlike price observations, corridor metrics have no fixed unit
   across sources — each record carries its own display `unit`.
──────────────────────────────────────────────────────────────── */

import { Confidence } from "./types";

/** Corridors we track. Extend the array + union together. */
export const CORRIDORS = ["hormuz", "china", "singapore", "ara", "usgulf"] as const;
export type CorridorId = (typeof CORRIDORS)[number];

export function isCorridorId(x: string): x is CorridorId {
  return (CORRIDORS as readonly string[]).includes(x);
}

/** Canonical corridor metric observation (one value for one period). */
export interface CorridorMetricRecord {
  corridor: CorridorId;
  metric: string; // stable slug, e.g. "crude_exports"
  value: number; // canonical value (unit below)
  unit: string; // display unit, e.g. "Mb/d", "%"
  periodDate: string; // YYYY-MM-DD the value describes
  observedAt: string; // ISO instant the value was true/published
  source: string; // source id
  confidence: Confidence; // import from ./types
  fetchedAt: string; // ISO
  raw: { value: number; unit: string }; // pre-normalization audit copy
  meta?: Record<string, string>;
}

/** What the API/frontend reads: newest row per (corridor, metric). */
export interface CorridorMetricLatest {
  corridor: CorridorId;
  metric: string;
  value: number;
  unit: string;
  periodDate: string;
  source: string;
  observedAt: string;
  updatedAt: string;
}
