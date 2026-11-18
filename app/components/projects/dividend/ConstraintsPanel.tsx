"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMarketSnapshot } from "../marketFetch";
import DividendChart from "./DividendChart";
import type { ConstraintsSnapshot, Gauge, GaugeStatus } from "../../../../backend/src/dividend/constraints/gauges";

const STATUS: Record<GaugeStatus, { label: string; color: string; meaning: string }> = {
  tight: { label: "Tight", color: "#e07a5f", meaning: "headwind for the build-out" },
  watch: { label: "Watch", color: "#d4a157", meaning: "tightening" },
  easy: { label: "Easy", color: "#5fc9a4", meaning: "not holding it back" },
  no_data: { label: "Not scored", color: "var(--ink-3)", meaning: "no data yet" },
};
const SERIES_COLORS = ["#8b9dff", "#5fc9a4"];

function useConstraints() {
  const [data, setData] = useState<ConstraintsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMarketSnapshot("/api/dividend/constraints").then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json();
      if (payload?.version !== 1 || !Array.isArray(payload.gauges)) throw new Error("unverified");
      if (active) { setData(payload); setError(null); }
    }).catch(() => { if (active) setError("Constraint gauges could not be loaded. Try again shortly."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return { data, loading, error, retry: useCallback(() => setAttempt(value => value + 1), []) };
}

function headline(gauge: Gauge): string {
  if (gauge.value === null) return "—";
  switch (gauge.id) {
    case "power_demand": case "power_price": return `${gauge.value > 0 ? "+" : gauge.value < 0 ? "−" : ""}${Math.abs(gauge.value).toFixed(1)}%`;
    case "financing": return `${Math.round(gauge.value * 100)}%`;
    case "uranium": case "copper": return `${gauge.value.toFixed(2)}×`;
    case "buildout": return `${gauge.value.toFixed(1)} GW`;
    case "water": return `${Math.round(gauge.value)}%`;
    default: return String(gauge.value);
  }
}

const caption: Partial<Record<Gauge["id"], string>> = {
  power_demand: "US electricity sales, last 12 months vs the 12 before",
  power_price: "US commercial price, 12-month average vs the year before",
  buildout: "Power drawn by tracked frontier AI data centres",
  water: "of tracked US data-centre power is in drought-hit states",
  uranium: "price vs its 5-year average",
  copper: "price vs its 5-year average",
  financing: "of hyperscaler operating cash flow spent on capex",
};

function GaugeCard({ gauge }: { gauge: Gauge }) {
  const status = STATUS[gauge.status];
  const chartUnit = gauge.unit === "%" ? "%" : gauge.unit ?? "";
  return <article className="flex flex-col border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6">
    <div className="flex items-start justify-between gap-3"><div><h4 className="text-base">{gauge.title}</h4><p className="mt-1 text-xs leading-5 text-[var(--ink-2)]">{gauge.question}</p></div><span className="shrink-0 border px-2 py-1 font-mono text-[10px] uppercase tracking-[.12em]" style={{ color: status.color, borderColor: status.color }}>{status.label}</span></div>
    <p className="mt-5 font-mono text-3xl tabular-nums tracking-tight" style={{ color: gauge.status === "no_data" ? "var(--ink-2)" : status.color }}>{headline(gauge)}</p>
    {caption[gauge.id] && gauge.value !== null && <p className="mt-1 text-[11px] text-[var(--ink-2)]">{caption[gauge.id]}{gauge.asOf ? ` · ${gauge.asOf}` : ""}</p>}
    <p className="mt-4 text-xs leading-6 text-[var(--ink)]">{gauge.detail}</p>
    <details className="mt-4 border-t border-[var(--line)] pt-3 text-xs leading-6 text-[var(--ink-2)]"><summary className="cursor-pointer">Rule, who gains and history</summary>
      <p className="mt-3"><span className="text-[var(--ink)]">Rule.</span> {gauge.rule}</p>
      <p className="mt-2"><span className="text-[var(--ink)]">Who gains.</span> {gauge.whoGains}</p>
      {gauge.series.length > 0 && <div className="mt-4 min-w-0"><DividendChart series={gauge.series.map((series, index) => ({ key: series.label, label: series.label, color: SERIES_COLORS[index], points: series.points.map(point => ({ ...point, status: null })) }))} unit={chartUnit} /></div>}
      <a href={gauge.source.url} target="_blank" rel="noreferrer" className="mt-3 inline-block underline">{gauge.source.label} ↗</a>
    </details>
  </article>;
}

export default function ConstraintsPanel() {
  const { data, loading, error, retry } = useConstraints();
  if (!data) return <div className="mt-8 border border-[var(--line)] p-6 text-sm text-[var(--ink-2)]" aria-busy={loading}>{loading ? "Loading constraint gauges…" : <span>{error} <button type="button" onClick={retry} className="underline">Try again</button></span>}</div>;
  const { summary } = data;
  const scored = summary.tight + summary.watch + summary.easy;
  return <div className="mt-8">
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border border-[var(--line)] px-5 py-4" role="status">
      {(["tight", "watch", "easy", "no_data"] as const).map(key => <span key={key} className="text-sm"><span className="font-mono text-lg tabular-nums" style={{ color: STATUS[key].color }}>{key === "no_data" ? summary.noData : summary[key]}</span> <span className="text-[var(--ink-2)]">{STATUS[key].label.toLowerCase()}</span></span>)}
      <span className="text-xs text-[var(--ink-2)] md:ml-auto">{scored ? `${summary.tight} of ${scored} scored constraints are a headwind for the AI build-out right now.` : "No constraint data loaded yet. Sources refresh daily."}</span>
    </div>
    <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">{data.gauges.map(gauge => <GaugeCard key={gauge.id} gauge={gauge} />)}</div>
    <p className="mt-5 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">Each gauge reads pressure on the AI build-out: easy means it isn’t holding the build-out back, tight means it is likely to slow it down or make it cost more. A tight gauge is often good news for someone: open “Rule, who gains and history” on each card. Thresholds are ours and written out so they can be argued with.</p>
  </div>;
}
