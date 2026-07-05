/* ────────────────────────────────────────────────────────────────
   Corridor source registry — sibling to sources/registry.ts for the
   corridor-metrics domain. The ONLY place corridor adapters are
   wired in.

   Future corridor sources (PortWatch for Hormuz/Singapore transits,
   data.gov.sg for Singapore bunker/arrivals) drop in here the same
   way: instantiate + add to the array. See docs/corridor-data-sources.md
   for the sourcing plan.
──────────────────────────────────────────────────────────────── */

import { CorridorSource } from "./CorridorSource";
import { EiaUsGulfSource } from "./eiaCorridor";

export function buildCorridorSources(): CorridorSource[] {
  return [new EiaUsGulfSource()];
}

export function getCorridorSource(id: string): CorridorSource | undefined {
  return buildCorridorSources().find((s) => s.descriptor.id === id);
}
