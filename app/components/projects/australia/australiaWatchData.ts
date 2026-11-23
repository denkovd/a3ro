"use client";
import { fetchMarketSnapshot } from "../marketFetch";
import { useEffect, useState } from "react";
import { estimateFreshness } from "../../../../backend/src/australia/watch";
import { AUSTRALIA_REGISTRY, isAustraliaIndicator } from "../../../../backend/src/australia/registry";
import type { AustraliaReleaseSchedule } from "../../../../backend/src/australia/types";
export type { AustraliaReleaseSchedule } from "../../../../backend/src/australia/types";

export type AustraliaObservation = { indicator: string; title: string; value: number; unit: string; unitMultiplier: number | null; frequency: "monthly" | "quarterly"; adjustment: string; referencePeriod: string; sourceUrl: string; publicationDate: string | null; firstRetrievedAt: string; lastVerifiedAt: string; };
export type FetchState = { health: "healthy" | "degraded" | "unavailable" | "never_attempted"; retrievedAt: string | null; error: string | null; };
export const AU_ROUTE = "/Projects/Australia-Watch";
export const AU_ACCENT = "#d4a157";

/** Short tile label from the registry; unknown ids fall back to the raw id. */
export function shortLabel(indicator: string): string {
  return isAustraliaIndicator(indicator) ? AUSTRALIA_REGISTRY[indicator].shortLabel : indicator;
}

/** Latest observation of each summary-tile indicator, in registry order (landing card and Macro Horizon). */
export function summaryLatest<T extends { indicator: string; referencePeriod: string }>(observations: T[]): T[] {
  const latest = observations.reduce<Record<string, T>>((a, o) => (!a[o.indicator] || a[o.indicator].referencePeriod < o.referencePeriod ? { ...a, [o.indicator]: o } : a), {});
  return Object.values(latest)
    .filter((o) => isAustraliaIndicator(o.indicator) && AUSTRALIA_REGISTRY[o.indicator].section === "primary" && (AUSTRALIA_REGISTRY[o.indicator] as { summaryTile?: boolean }).summaryTile === true)
    .sort((a, b) => AUSTRALIA_REGISTRY[a.indicator as keyof typeof AUSTRALIA_REGISTRY].order - AUSTRALIA_REGISTRY[b.indicator as keyof typeof AUSTRALIA_REGISTRY].order);
}

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

type DisplayDef = { display?: "percent" | "percentage_points" | "index" | "hours_millions" | "count" | "thousands" | "aud_millions" | "aud_thousands"; decimals?: number };
function displayDef(indicator: string): Required<DisplayDef> {
  const def = (isAustraliaIndicator(indicator) ? AUSTRALIA_REGISTRY[indicator] : {}) as DisplayDef;
  const display = def.display ?? (indicator === "hours_worked" ? "hours_millions" : "percent");
  return { display, decimals: def.decimals ?? 1 };
}
const signed = (v: number, dp: number) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
const grouped = (v: number, dp = 0) => v.toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp });
/** A$ millions: billions above $10bn of magnitude, otherwise millions. Sign kept for balances. */
function audMillions(v: number, withSign = false): string {
  const sign = v < 0 ? "-" : withSign ? "+" : "";
  const a = Math.abs(v);
  return a >= 10_000 ? `${sign}$${grouped(a / 1000, 1)}b` : `${sign}$${grouped(a)}m`;
}

export function displayValue(o: AustraliaObservation): string {
  const { display, decimals } = displayDef(o.indicator);
  if (display === "hours_millions") return `${(o.value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}m hours`;
  if (display === "percentage_points") return `${signed(o.value, decimals)} pp`;
  if (display === "index") return o.value.toFixed(decimals);
  if (display === "count") return grouped(o.value);
  if (display === "thousands") return `${grouped(o.value, decimals)}k`;
  if (display === "aud_millions") return audMillions(o.value);
  if (display === "aud_thousands") return `$${grouped(o.value, decimals)}k`;
  return `${o.value.toFixed(decimals)}%`;
}
export function delta(o: AustraliaObservation, all: AustraliaObservation[]): string {
  const earlier = all.filter((x) => x.indicator === o.indicator && x.referencePeriod < o.referencePeriod).sort((a, b) => b.referencePeriod.localeCompare(a.referencePeriod))[0];
  if (!earlier) return "change unavailable";
  const prior = `vs prior ${o.frequency === "monthly" ? "month" : "quarter"}`;
  const { display, decimals } = displayDef(o.indicator);
  if (display === "hours_millions") { const d = (o.value - earlier.value) / 1000; const pct = ((o.value / earlier.value) - 1) * 100; return `${signed(d, 1)}m hours · ${signed(pct, 1)}% ${prior}`; }
  if (display === "index") { const pct = ((o.value / earlier.value) - 1) * 100; return `${signed(o.value - earlier.value, decimals)} · ${signed(pct, 1)}% ${prior}`; }
  if (display === "aud_millions") return `${audMillions(o.value - earlier.value, true)} ${prior}`;
  if (display === "aud_thousands") { const d = o.value - earlier.value; const pct = earlier.value ? ((o.value / earlier.value) - 1) * 100 : null; return `${d >= 0 ? "+" : "-"}$${grouped(Math.abs(d), decimals)}k${pct === null ? "" : ` · ${signed(pct, 1)}%`} ${prior}`; }
  if (display === "count" || display === "thousands") {
    const d = o.value - earlier.value; const pct = earlier.value ? ((o.value / earlier.value) - 1) * 100 : null;
    const abs = display === "count" ? `${d >= 0 ? "+" : "-"}${grouped(Math.abs(d))}` : `${d >= 0 ? "+" : "-"}${grouped(Math.abs(d), decimals)}k`;
    return `${abs}${pct === null ? "" : ` · ${signed(pct, 1)}%`} ${prior}`;
  }
  return `${signed(o.value - earlier.value, decimals)} pp ${prior}`;
}
export function estimatedFreshness(o: AustraliaObservation, now = new Date(), schedule?: AustraliaReleaseSchedule): "fresh" | "aging" | "stale" {
  const lagDays = isAustraliaIndicator(o.indicator) ? AUSTRALIA_REGISTRY[o.indicator].releaseLagDays : undefined;
  return estimateFreshness(o.frequency, o.referencePeriod, now, schedule?.latestReferencePeriod, lagDays) as "fresh" | "aging" | "stale";
}

export function fetchOverdue(verifiedAt: string | null | undefined, now = new Date()): boolean {
  return !verifiedAt || !Number.isFinite(Date.parse(verifiedAt)) || now.getTime() - Date.parse(verifiedAt) > 48 * 3_600_000;
}

export function releaseDateLabel(releaseAt: string | null | undefined): string {
  return releaseAt ? new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(releaseAt)) : "Not confirmed";
}
