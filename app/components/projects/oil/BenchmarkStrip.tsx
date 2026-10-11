"use client";
import type { Benchmark, DailyPrice } from "@a3ro/oil-backend";
import { formatPctSigned, formatUsdBbl } from "../oilFormat";
import type { BenchmarkRow } from "./types";

export default function BenchmarkStrip({ benchmarks, series, selected, onSelect }: {
  benchmarks: BenchmarkRow[]; series: Partial<Record<Benchmark, DailyPrice[]>>;
  selected: Benchmark | null; onSelect: (b: Benchmark) => void;
}) {
  return <section aria-label="Oil benchmark prices" className="w-[min(320px,calc(100vw-96px))] border border-[var(--line)] bg-[rgba(11,13,13,0.92)] backdrop-blur-md">
    <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]"><span>Crude benchmarks</span><span>USD / bbl</span></div>
    <div className="grid grid-cols-2 divide-x divide-[var(--line)]">{benchmarks.map(b => {
      const values = (series[b.id] ?? []).filter(p => Number.isFinite(p.price)).map(p => p.price);
      const min = Math.min(...values), range = Math.max(...values) - min;
      const points = values.map((v, i) => `${(i / (values.length - 1) * 120).toFixed(1)},${(22 - (v - min) / (range || 1) * 20).toFixed(1)}`).join(" ");
      return <button key={b.id} type="button" aria-pressed={selected === b.id} aria-label={`Open ${b.title} price history`} onClick={() => onSelect(b.id)} className={`min-w-0 px-3 py-2 text-left hover:bg-white/5 ${selected === b.id ? "bg-[#d4a157]/10" : ""}`}>
        <span className="flex items-center justify-between gap-1 font-mono text-[9px]"><span className="text-[#d4a157]">{b.id}</span><span className="text-[8px] text-[var(--ink-3)]">{b.statusText}</span></span>
        <span className="mt-1 block font-mono text-lg text-[var(--ink)]">{b.price === null ? "—" : formatUsdBbl(b.price)}</span>
        <span className="block text-[8px] text-[var(--ink-3)]">{b.basis}</span>
        <span className="block font-mono text-[9px] text-[var(--ink-2)]" title={b.changeVsDate ? `Versus close ${b.changeVsDate}` : "No comparable prior close for this quote basis"}>{b.changePct === null ? "Daily spot history" : `${formatPctSigned(b.changePct)} vs ${b.changeVsDate?.slice(5)}`}</span>
        {values.length > 1 && <svg viewBox="0 0 120 24" className="mt-1 h-5 w-full" aria-label={`${b.id} daily close trend`} role="img"><polyline points={points} fill="none" stroke="#d4a157" strokeWidth="1.2" /></svg>}
        <span className="mt-1 block truncate text-[8px] text-[var(--ink-3)]" title={b.observedAt ?? undefined}>{b.observedAt ? b.observedAt.slice(0, 16).replace("T", " ") + " UTC" : "Awaiting price"}</span>
        {b.suspect && <span className="block text-[8px] text-[#d4a157]">Source discrepancy</span>}
        {b.refreshFailed && <span className="block text-[8px] text-[#d4a157]">Price refresh failed</span>}
      </button>;
    })}</div>
  </section>;
}
