"use client";
import { useMemo, useState } from "react";
import type { InternalResearchResult } from "../../../backend/src/macro/internalResearch";

export const percent = (n: number | null | undefined, digits = 2) => n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(digits)}%`;
export const ratio = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "—" : n.toFixed(2);
export const phaseLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
export const panel = "rounded-2xl border border-white/10 bg-[#111c2c] p-5 md:p-6";
export const th = "whitespace-nowrap px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
export const td = "px-3 py-3 align-top tabular-nums";
export const field = "mt-2 block w-full rounded-lg border border-white/15 bg-[#09121f] px-3 py-2.5 text-sm text-slate-100 focus:border-teal-300 focus:outline-none";

export function EquityPlot({ result, selected }: { result: InternalResearchResult; selected: string }) {
  const [mode, setMode] = useState<"equity" | "drawdown">("equity");
  const [inspect, setInspect] = useState<number | null>(null);
  const chart = useMemo(() => {
    const series = [...new Set([selected, "static", "hold"])].map((id, i) => {
      const row = result.rows.find(r => r.id === id)!;
      let peak = 1;
      return { name: row.name, color: ["#5eead4", "#f0c674", "#93a4bc"][i], points: row.curve.map(p => { peak = Math.max(peak, p.equity); return { date: p.date, value: mode === "equity" ? p.equity * 10000 : p.equity / peak - 1 }; }) };
    });
    const values = series.flatMap(s => s.points.map(p => p.value));
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const x = (i: number) => 65 + i / (series[0].points.length - 1) * 800;
    const y = (v: number) => 25 + (max - v) / span * 220;
    return { series, paths: series.map(s => ({ ...s, path: s.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ") })), ticks: [0, 1, 2, 3, 4].map(i => ({ y: 25 + i * 55, value: max - span * i / 4 })) };
  }, [result, selected, mode]);
  const index = Math.min(inspect ?? chart.series[0].points.length - 1, chart.series[0].points.length - 1);
  const format = (v: number) => mode === "equity" ? `$${Math.round(v).toLocaleString("en-US")}` : percent(v);
  return <div className={panel}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">{mode === "equity" ? "Growth of $10,000" : "Drawdown from peak"}</h2><div className="flex gap-2">{(["equity", "drawdown"] as const).map(m => <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-lg px-3 py-2 text-xs ${mode === m ? "bg-teal-300/15 text-teal-200" : "text-slate-400"}`}>{phaseLabel(m)}</button>)}</div></div>
    <svg viewBox="0 0 890 280" role="img" aria-label={`${mode} comparison for the selected rule, monthly static allocation and buy and hold`} className="mt-5 w-full">{chart.ticks.map(t => <g key={t.y}><line x1="65" x2="865" y1={t.y} y2={t.y} stroke="#253044"/><text x="58" y={t.y + 4} textAnchor="end" fill="#94a3b8" fontSize="10">{format(t.value)}</text></g>)}{chart.paths.map(p => <path key={p.name} d={p.path} stroke={p.color} strokeWidth="1.8" fill="none"/>)}<text x="65" y="272" fill="#94a3b8" fontSize="10">{result.rows[0].metrics.from}</text><text x="865" y="272" textAnchor="end" fill="#94a3b8" fontSize="10">{result.through}</text></svg>
    <label className="mt-2 block text-xs text-slate-400">Inspect date · {chart.series[0].points[index].date}<input type="range" min="0" max={chart.series[0].points.length - 1} value={index} onChange={e => setInspect(Number(e.target.value))} className="mt-2 w-full accent-teal-300"/></label>
    <div className="mt-3 flex flex-wrap gap-4 text-xs">{chart.series.map(s => <span key={s.name} style={{ color: s.color }}>{s.name}: {format(s.points[index].value)}</span>)}</div>
  </div>;
}

export function PhaseTables({ result, selected }: { result: InternalResearchResult; selected: string }) {
  const policy = result.phases.summaries[0]?.overlays[selected] ? selected : "alignment";
  return <div className="space-y-5"><section className={panel}><h2 className="font-medium">Performance within contiguous macro phases</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Asset returns compare buy and hold with cash, before entry/exit costs. Rule advantage compares net returns with monthly static 60/30/10. Values are mean relative growth per 21 sessions, equally weighted by complete episode.</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Asset opportunities and selected rule advantage by phase</caption><thead><tr>{["Phase", "Complete / all episodes", "Stocks vs cash", "Gold vs cash", "Bitcoin vs cash", "Rule vs static", "95% range"].map(h => <th key={h} className={th} scope="col">{h}</th>)}</tr></thead><tbody>{result.phases.summaries.map(p => <tr key={p.phase} className="border-t border-white/10"><th className={`${td} text-left font-normal`} scope="row">{phaseLabel(p.phase)}</th><td className={td}>{p.completeEpisodes} / {p.episodes}</td>{["stocks", "gold", "bitcoin"].map(k => <td key={k} className={td}>{percent(p.assets[k].mean)}<span className="block text-[10px] text-slate-500">n={p.assets[k].n}</span></td>)}<td className={td}>{percent(p.overlays[policy].mean)}</td><td className={`${td} text-xs text-slate-400`}>{p.overlays[policy].interval?.map(v => percent(v)).join(" to ") ?? "Too few episodes"}</td></tr>)}</tbody></table></div></section>
    <section className={panel}><h2 className="font-medium">Individual periods and compounded returns</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-xs"><thead><tr>{["Phase", "From → to", "Sessions", "Stocks", "Gold", "Bitcoin", "Cash", "Static", "Selected rule"].map(h => <th key={h} className={th} scope="col">{h}</th>)}</tr></thead><tbody>{result.phases.episodes.map(e => <tr key={e.from} className="border-t border-white/10"><th className={`${td} text-left font-normal`} scope="row">{e.phase ? phaseLabel(e.phase) : "Pending"}{!e.complete ? " · partial" : ""}</th><td className={`${td} whitespace-nowrap`}>{e.from} → {e.to}</td><td className={td}>{e.days}</td>{[e.assetReturns.stocks, e.assetReturns.gold, e.assetReturns.bitcoin, e.cashReturn, e.baseReturn, e.overlayReturns[policy]].map((n, i) => <td className={td} key={i}>{percent(n)}</td>)}</tr>)}</tbody></table></div><p className="mt-4 text-xs leading-relaxed text-slate-500">{result.phases.method}</p></section></div>;
}
