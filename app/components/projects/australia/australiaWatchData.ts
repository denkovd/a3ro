"use client";
import { useEffect, useState } from "react";
import { estimateFreshness } from "../../../../backend/src/australia/watch";

export type AustraliaObservation = { indicator: string; title: string; value: number; unit: string; unitMultiplier: number | null; frequency: "monthly" | "quarterly"; adjustment: string; referencePeriod: string; sourceUrl: string; publicationDate: string | null; firstRetrievedAt: string; lastVerifiedAt: string; };
export type FetchState = { health: "healthy" | "degraded" | "unavailable" | "never_attempted"; retrievedAt: string | null; error: string | null; };
export const AU_ROUTE = "/Projects/Australia-Watch";
export const AU_ACCENT = "#d4a157";

export function useAustraliaWatch() {
  const [state, setState] = useState<{ observations: AustraliaObservation[]; fetchStates: Record<string, FetchState>; status: "loading" | "ready" | "error"; testMode?: boolean }>({ observations: [], fetchStates: {}, status: "loading" });
  useEffect(() => { let live = true; fetch("/api/australia-watch/latest", { cache: "no-store" }).then(async (r) => {
    if (!r.ok) throw new Error(`Australia Watch ${r.status}`); return r.json();
  }).then((v) => live && setState({ observations: Array.isArray(v.observations) ? v.observations : [], fetchStates: v.fetchStates ?? {}, status: "ready", testMode: v.testMode === true })).catch(() => live && setState((s) => ({ ...s, status: "error" }))); return () => { live = false; }; }, []);
  return state;
}

export function displayValue(o: AustraliaObservation): string {
  if (o.indicator === "hours_worked") return `${(o.value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}m hours`;
  return `${o.value.toFixed(o.indicator === "unemployment_rate" ? 1 : 1)}%`;
}
export function delta(o: AustraliaObservation, all: AustraliaObservation[]): string {
  const earlier = all.filter((x) => x.indicator === o.indicator && x.referencePeriod < o.referencePeriod).sort((a, b) => b.referencePeriod.localeCompare(a.referencePeriod))[0];
  if (!earlier) return "change unavailable";
  if (o.indicator === "hours_worked") { const d = (o.value - earlier.value) / 1000; const pct = ((o.value / earlier.value) - 1) * 100; return `${d >= 0 ? "+" : ""}${d.toFixed(1)}m hours · ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs prior month`; }
  const d = o.value - earlier.value; return `${d >= 0 ? "+" : ""}${d.toFixed(1)} pp vs prior ${o.frequency === "monthly" ? "month" : "quarter"}`;
}
export function estimatedFreshness(o: AustraliaObservation, now = new Date()): "fresh" | "aging" | "stale" {
  return estimateFreshness(o.frequency, o.referencePeriod, now) as "fresh" | "aging" | "stale";
}
