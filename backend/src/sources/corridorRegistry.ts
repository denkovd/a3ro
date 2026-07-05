/* ────────────────────────────────────────────────────────────────
   Corridor source registry — sibling to sources/registry.ts for the
   corridor-metrics domain. The ONLY place corridor adapters are
   wired in.

   Future corridor sources (data.gov.sg for Singapore bunker/arrivals,
   etc.) drop in here the same way: instantiate + add to the array.
   See docs/corridor-data-sources.md for the sourcing plan.
──────────────────────────────────────────────────────────────── */

import { CorridorSource } from "./CorridorSource";
import { EiaUsGulfSource } from "./eiaCorridor";
import { PortWatchSource } from "./portwatch";

export function buildCorridorSources(): CorridorSource[] {
  return [new EiaUsGulfSource(), new PortWatchSource()];
}

export function getCorridorSource(id: string): CorridorSource | undefined {
  return buildCorridorSources().find((s) => s.descriptor.id === id);
}
