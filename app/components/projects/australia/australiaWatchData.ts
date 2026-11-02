"use client";
import { fetchMarketSnapshot } from "../marketFetch";
import { useEffect, useState } from "react";
import { estimateFreshness } from "../../../../backend/src/australia/watch";
import type { AustraliaReleaseSchedule } from "../../../../backend/src/australia/types";
export type { AustraliaReleaseSchedule } from "../../../../backend/src/australia/types";

export type AustraliaObservation = { indicator: string; title: string; value: number; unit: string; unitMultiplier: number | null; frequency: "monthly" | "quarterly"; adjustment: string; referencePeriod: string; sourceUrl: string; publicationDate: string | null; firstRetrievedAt: string; lastVerifiedAt: string; };
export type FetchState = { health: "healthy" | "degraded" | "unavailable" | "never_attempted"; retrievedAt: string | null; error: string | null; };
export const AU_ROUTE = "/Projects/Australia-Watch";
export const AU_ACCENT = "#d4a157";

export function useAustraliaWatch() {
  const [state, setState] = useState<{ observations: AustraliaObservation[]; fetchStates: Record<string, FetchState>; releaseSchedules: Record<string, AustraliaReleaseSchedule>; status: "loading" | "ready" | "error"; refreshError: boolean; testMode?: boolean }>({ observations: [], fetchStates: {}, releaseSchedules: {}, status: "loading", refreshError: false });
  useEffect(() => {
    let live = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const response = await fetchMarketSnapshot("/api/australia-watch/latest");
        if (!response.ok) throw new Error(`Australia Watch ${response.status}`);
        const value = await response.json();
        if (live) setState({ observations: Array.isArray(value.observations) ? value.observations : [], fetchStates: value.fetchStates ?? {}, releaseSchedules: value.releaseSchedules ?? {}, status: "ready", refreshError: false, testMode: value.testMode === true });
      } catch {
        if (live) setState(s => ({ ...s, status: s.status === "ready" ? "ready" : "error", refreshError: true }));
      } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
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
export function estimatedFreshness(o: AustraliaObservation, now = new Date(), schedule?: AustraliaReleaseSchedule): "fresh" | "aging" | "stale" {
  return estimateFreshness(o.frequency, o.referencePeriod, now, schedule?.latestReferencePeriod) as "fresh" | "aging" | "stale";
}

export function fetchOverdue(verifiedAt: string | null | undefined, now = new Date()): boolean {
  return !verifiedAt || !Number.isFinite(Date.parse(verifiedAt)) || now.getTime() - Date.parse(verifiedAt) > 48 * 3_600_000;
}

export function releaseDateLabel(releaseAt: string | null | undefined): string {
  return releaseAt ? new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(releaseAt)) : "Not confirmed — check ABS calendar";
}
