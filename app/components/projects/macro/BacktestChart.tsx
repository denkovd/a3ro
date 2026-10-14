"use client";
import { useMemo, useState } from "react";
import type { ResearchResult } from "../../../../backend/src/macro/backtestResearch";
import { SP_BENCHMARK, BTC_HOLD_NAME, NVIDIA_HOLD_NAME } from "../../../../backend/src/macro/researchBenchmarks";
import { VAMS_21_NAME, VAMS_21_TWO_ASSET_NAME } from "../../../../backend/src/macro/vams21Backtest";

const COLORS = ["#e0b969", "#8a9ac1", "#76c7af", "#d6a0ca", "#a49fae", "#97bd80", "#e79e78", "#79bddd", "#cbbb81", "#bb92de", "#62d8d0", "#ed829a", "#c4d9ea"];
const DEFAULT_SERIES = ["Your test strategy", "Current regime strategy", SP_BENCHMARK, "Traditional 60/40", VAMS_21_NAME, VAMS_21_TWO_ASSET_NAME, BTC_HOLD_NAME, NVIDIA_HOLD_NAME];

export default function BacktestChart({ result }: { result: ResearchResult }) {
  const [mode, setMode] = useState<"equity" | "drawdown">("equity");
  const [selected, setSelected] = useState<number | null>(null);
  const [visible, setVisible] = useState(() => new Set(DEFAULT_SERIES));
  const chart = useMemo(() => {
    const steps = result.candidate.steps;
    const dates = [steps[0].date, ...steps.map(s => s.endDate)];
    const first = Date.parse(dates[0]), last = Date.parse(dates.at(-1)!);
    const xs = dates.map(date => 72 + (Date.parse(date) - first) / (last - first) * 788);
    const allSeries = [
      { label: "Your test strategy", values: [1, ...steps.map(s => s.equity)] },
      { label: "Current regime strategy", values: [1, ...result.baseline.steps.map(s => s.equity)] },
      ...Object.keys(result.candidate.benchmarks).map(label => ({ label, values: [1, ...steps.map(s => s.benchmarkEquity[label])] })),
    ].map((series, index) => {
      let peak = 1;
      return { ...series, color: COLORS[index] ?? `hsl(${Math.round(index * 137.508 % 360)} 65% 70%)`, values: series.values.map(value => {
        peak = Math.max(peak, value);
        return mode === "equity" ? value * 10000 : (value / peak - 1) * 100;
      }) };
    });
    const chosen = allSeries.filter(series => visible.has(series.label));
    let min = mode === "equity" ? 10000 : 0, max = min;
    for (const series of chosen) for (const value of series.values) { min = Math.min(min, value); max = Math.max(max, value); }
    const padding = Math.max((max - min) * 0.08, mode === "equity" ? 100 : 1);
    min -= padding; max += padding;
    const y = (value: number) => 18 + (max - value) / (max - min) * 230;
    const paths = chosen.map(series => ({ ...series,
      path: series.values.map((value, index) => `${index ? "L" : "M"}${xs[index].toFixed(1)},${y(value).toFixed(1)}`).join(" ") }));
    const ticks = Array.from({ length: 5 }, (_, index) => { const value = min + (max - min) * index / 4; return { value, y: y(value) }; });
    return { dates, xs, allSeries, paths, ticks };
  }, [result, mode, visible]);
  const format = (value: number) => mode === "equity" ? `$${Math.round(value).toLocaleString("en-US")}` : `${value.toFixed(1)}%`;
  const index = Math.min(selected ?? chart.dates.length - 1, chart.dates.length - 1);
  const toggle = (name: string) => setVisible(previous => {
    const next = new Set(previous);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  return <div className="mt-6 rounded border border-[var(--line)] bg-[var(--depth-1)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--ink)]">{mode === "equity" ? "Growth of $10,000" : "Drawdown from the previous peak"}</p>
      <div className="flex gap-2">
        {(["equity", "drawdown"] as const).map(tab => <button key={tab} type="button" aria-pressed={mode === tab}
          onClick={() => setMode(tab)} className="rounded border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink-2)]"
          style={mode === tab ? { borderColor: COLORS[0], color: COLORS[0] } : undefined}>{tab === "equity" ? "Equity" : "Drawdown"}</button>)}
      </div>
    </div>
    <fieldset className="mt-4"><legend className="text-xs text-[var(--ink-3)]">Show portfolios</legend>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {chart.allSeries.map(series => <label key={series.label} className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: series.color }}>
          <input type="checkbox" checked={visible.has(series.label)} onChange={() => toggle(series.label)} className="accent-[#e0b969]" />{series.label}
        </label>)}
      </div>
      <div className="mt-3 flex gap-3 text-xs text-[var(--ink-3)]">
        <button type="button" className="underline underline-offset-4" onClick={() => setVisible(new Set(chart.allSeries.map(series => series.label)))}>Show all available</button>
        <button type="button" className="underline underline-offset-4" onClick={() => setVisible(new Set(DEFAULT_SERIES))}>Default view</button>
      </div>
    </fieldset>
    {chart.paths.length ? <>
      <svg viewBox="0 0 880 285" role="img" aria-label={`${mode === "equity" ? "Equity" : "Drawdown"} comparison from ${chart.dates[0]} to ${chart.dates.at(-1)}; ${chart.paths.map(series => series.label).join(", ")}`} className="mt-3 w-full">
        {chart.ticks.map((tick, i) => <g key={i}><line x1="72" x2="860" y1={tick.y} y2={tick.y} stroke="var(--line)" />
          <text x="64" y={tick.y + 4} textAnchor="end" fill="var(--ink-3)" fontSize="11">{format(tick.value)}</text></g>)}
        {[...chart.paths.filter(series => series.label !== "Your test strategy"), ...chart.paths.filter(series => series.label === "Your test strategy")].map(series => <path key={series.label}
          d={series.path} fill="none" stroke={series.color} strokeWidth={series.label === "Your test strategy" ? 2.4 : 1.5}
          strokeDasharray={series.label === "Current regime strategy" ? "4 3" : undefined} />)}
        <line x1={chart.xs[index]} x2={chart.xs[index]} y1="18" y2="248" stroke="var(--ink-3)" strokeDasharray="3 5" />
        <text x="72" y="276" fill="var(--ink-3)" fontSize="11">{chart.dates[0]}</text>
        <text x="860" y="276" textAnchor="end" fill="var(--ink-3)" fontSize="11">{chart.dates.at(-1)}</text>
      </svg>
      <label className="block text-xs text-[var(--ink-3)]">Inspect date: {chart.dates[index]}
        <input aria-label="Inspect chart date" type="range" min="0" max={chart.dates.length - 1} value={index} onChange={event => setSelected(Number(event.target.value))}
          className="mt-2 w-full accent-[#e0b969]" />
      </label>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {chart.paths.map(series => <span key={series.label} style={{ color: series.color }}>{series.label}: {format(series.values[index])}</span>)}
      </div>
    </> : <p role="status" className="mt-6 text-sm text-[var(--ink-3)]">Select a portfolio to display its curve.</p>}
  </div>;
}
