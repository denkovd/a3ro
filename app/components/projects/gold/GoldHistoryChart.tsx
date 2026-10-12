"use client";

import { useEffect, useState } from "react";
import { historyStart, sortedHistory, sourceLabel, reportTime } from "./dataQuality";
import { formatTonnes, formatToz, formatFlowT, type GoldFlowMetric } from "./useGoldFlowData";

const ETF_METRICS = [
  { locus: "etf_us", metric: "etf_holdings_t", label: "NA holdings" },
  { locus: "etf_us", metric: "etf_flow_t", label: "Weekly change" },
  { locus: "etf_global", metric: "etf_holdings_t", label: "Global holdings" },
];
const COMEX_METRICS = [
  { locus: "comex", metric: "comex_registered_toz", label: "Registered" },
  { locus: "comex", metric: "comex_eligible_toz", label: "Eligible" },
  { locus: "comex", metric: "comex_combined_toz", label: "Total" },
];
const RANGES = [{ label: "1M", months: 1 }, { label: "3M", months: 3 }, { label: "1Y", months: 12 }];

export default function GoldHistoryChart({ holderId, refreshedAt }: { holderId: "etf_us" | "comex"; refreshedAt: number | null }) {
  const options = holderId === "comex" ? COMEX_METRICS : ETF_METRICS;
  const [metricIndex, setMetricIndex] = useState(0);
  const [months, setMonths] = useState(3);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; status: "loading" | "ready" | "error"; rows: GoldFlowMetric[] }>({ key: "", status: "loading", rows: [] });
  const option = options[metricIndex];
  const key = `${option.locus}:${option.metric}:${months}:${attempt}:${refreshedAt}`;

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    const query = new URLSearchParams({ locus: option.locus, metric: option.metric, from: historyStart(months), to: new Date().toISOString().slice(0, 10) });
    async function load() {
      try {
        const res = await fetch(`/api/gold/loci/series?${query}`, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error("History unavailable");
        const body = await res.json();
        if (!Array.isArray(body.series)) throw new Error("Invalid history response");
        const rows = sortedHistory(body.series, option.locus, option.metric);
        if (alive) setResult({ key, status: "ready", rows });
      } catch {
        if (alive) setResult({ key, status: "error", rows: [] });
      } finally {
        clearTimeout(timeout);
      }
    }
    load();
    return () => { alive = false; controller.abort(); clearTimeout(timeout); };
  }, [key, months, option.locus, option.metric]);

  const status = result.key === key ? result.status : "loading";
  const rows = result.key === key ? result.rows : [];
  const weekly = option.metric === "etf_flow_t";
  const format = holderId === "comex" ? formatToz : weekly ? formatFlowT : formatTonnes;
  const values = rows.map((r) => r.value);
  const min = values.length ? Math.min(...values, ...(weekly ? [0] : [])) : 0;
  const max = values.length ? Math.max(...values, ...(weekly ? [0] : [])) : 0;
  const padding = max === min ? Math.max(Math.abs(max) * 0.02, 1) : (max - min) * 0.1;
  const low = min - padding;
  const high = max + padding;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const duration = first && last ? reportTime(last.periodDate) - reportTime(first.periodDate) : 0;
  const x = (r: GoldFlowMetric) => 10 + (duration ? (reportTime(r.periodDate) - reportTime(first.periodDate)) / duration : 0.5) * 280;
  const y = (v: number) => 104 - ((v - low) / (high - low)) * 92;
  const path = rows.map((r, i) => `${i ? "L" : "M"}${x(r).toFixed(2)},${y(r.value).toFixed(2)}`).join(" ");

  return (
    <section aria-label="Holdings history" className="mt-4 border-t border-[var(--line)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <h5 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-2)]">Report history</h5>
        <div role="group" aria-label="History range" className="flex gap-1">
          {RANGES.map((r) => <button type="button" key={r.label} aria-pressed={months === r.months} onClick={() => setMonths(r.months)} className="rounded-sm px-2 py-1 font-mono text-[10px] hover:bg-[var(--depth-2)]" style={{ color: months === r.months ? "#dcc689" : "var(--ink-3)" }}>{r.label}</button>)}
        </div>
      </div>
      <div role="group" aria-label="History metric" className="mt-2 flex flex-wrap gap-1">
        {options.map((o, i) => <button type="button" key={o.metric + o.locus} aria-pressed={metricIndex === i} onClick={() => setMetricIndex(i)} className="rounded-sm border border-[var(--line)] px-2 py-1 text-[10px] hover:bg-[var(--depth-2)]" style={{ color: metricIndex === i ? "#dcc689" : "var(--ink-3)" }}>{o.label}</button>)}
      </div>
      <div aria-live="polite" className="mt-3">
        {status === "loading" ? <p className="py-8 text-center text-[11px] text-[var(--ink-3)]">Loading report history…</p>
          : status === "error" ? <div className="py-5 text-[11px] text-[var(--ink-3)]">History is temporarily unavailable. <button type="button" onClick={() => setAttempt((v) => v + 1)} className="text-[var(--ink)] underline">Retry history</button></div>
          : rows.length === 0 ? <p className="py-5 text-[11px] leading-relaxed text-[var(--ink-3)]">No reports stored for this period. Try a longer range; the latest reading may be outside this window.</p>
          : rows.length === 1 ? <p className="py-5 text-[11px] text-[var(--ink-2)]">One report: {format(first.value)} · {first.periodDate}. More reports are needed to show a trend.</p>
          : <>
            <div className="flex justify-between font-mono text-[9px] text-[var(--ink-3)]"><span>High {format(max)}</span><span>Low {format(min)}</span></div>
            <svg viewBox="0 0 300 116" role="img" aria-label={`${option.label}: ${format(first.value)} on ${first.periodDate} to ${format(last.value)} on ${last.periodDate}`} className="mt-1 w-full">
              <title>{option.label} · published reports</title>
              <line x1="10" y1={weekly ? y(0) : 104} x2="290" y2={weekly ? y(0) : 104} stroke="var(--line)" />
              {weekly ? rows.map((r) => <line key={r.periodDate} x1={x(r)} x2={x(r)} y1={y(0)} y2={y(r.value)} stroke={r.value >= 0 ? "#dcc689" : "var(--ink-2)"} strokeWidth={Math.max(2, Math.min(10, 200 / rows.length))}><title>{r.periodDate}: {format(r.value)}</title></line>)
                : <path d={path} fill="none" stroke="#dcc689" strokeWidth="1.8" />}
              {rows.map((r) => <circle key={r.periodDate} cx={x(r)} cy={y(r.value)} r="2" fill="#dcc689"><title>{r.periodDate}: {format(r.value)}</title></circle>)}
            </svg>
            <div className="flex justify-between font-mono text-[9px] text-[var(--ink-3)]"><span>{first.periodDate}</span><span>{last.periodDate}</span></div>
            <p className="mt-2 text-[11px] text-[var(--ink-2)]">{weekly ? `Latest weekly change: ${format(last.value)}` : `Change across shown reports: ${holderId === "comex" ? `${last.value - first.value > 0 ? "+" : ""}${formatToz(last.value - first.value)}` : formatFlowT(last.value - first.value)}`}</p>
            <details className="mt-2 text-[10px] text-[var(--ink-3)]"><summary className="cursor-pointer">View {rows.length} reported values</summary><div className="mt-2 max-h-36 overflow-y-auto"><table className="w-full text-left"><caption className="sr-only">{option.label} reported values</caption><thead><tr><th scope="col">Report date</th><th scope="col" className="text-right">Value</th></tr></thead><tbody>{rows.map((r) => <tr key={r.periodDate}><td>{r.periodDate}</td><td className="text-right font-mono">{format(r.value)}</td></tr>)}</tbody></table></div></details>
          </>}
      </div>
      {last && status === "ready" ? <p className="mt-2 text-[10px] text-[var(--ink-3)]">{sourceLabel(last.source)} · {weekly ? "Weekly holdings change; not shipping volume." : "Reported stock; not continuous live telemetry."}</p> : null}
    </section>
  );
}
