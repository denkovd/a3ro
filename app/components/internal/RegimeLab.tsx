"use client";
import { useEffect, useState } from "react";
import type { InternalResearchResult, LabConfig } from "../../../backend/src/macro/internalResearch";
import type { Quadrant } from "../../../backend/src/macro/allocation";
import LabCorrelations from "./LabCorrelations";
import { EquityPlot, PhaseTables, field, panel, percent, phaseLabel, ratio, td, th } from "./LabVisuals";

const STORAGE = "a3ro.internal-regime-lab.v1";
const regimes: Quadrant[] = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"];
const assets = [{ key: "stocks", label: "Stocks" }, { key: "gold", label: "Gold" }, { key: "bitcoin", label: "Bitcoin" }] as const;
const button = "rounded-lg border border-white/15 px-4 py-2.5 text-xs text-slate-300 hover:border-teal-300/60 disabled:opacity-40";
interface SavedExperiment { id: string; name: string; savedAt: string; config: LabConfig; dataset: InternalResearchResult["dataset"]; rows: { id: string; name: string; sharpe: number | null; cagr: number }[] }

export default function RegimeLab() {
  const [config, setConfig] = useState<LabConfig | null>(null);
  const [through, setThrough] = useState("");
  const [result, setResult] = useState<InternalResearchResult | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("alignment");
  const [tab, setTab] = useState<"performance" | "phases" | "correlations" | "trades">("performance");
  const [saved, setSaved] = useState<SavedExperiment[]>([]), [name, setName] = useState("Regime alignment · first test");
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const boot = async () => {
      try {
        const metaResponse = await fetch("/api/internal/regime-lab", { signal: controller.signal, cache: "no-store" });
        const meta = await metaResponse.json();
        if (!metaResponse.ok) throw new Error(meta.error ?? "Local research is unavailable.");
        setThrough(meta.through); setConfig(meta.config);
        const response = await fetch("/api/internal/regime-lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta.config), signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Research failed.");
        setResult(body);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load research."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    };
    void boot();
    try { const data: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "[]"); if (Array.isArray(data)) setSaved(data.filter(s => s?.id && typeof s.name === "string" && s.config && Array.isArray(s.rows)).slice(0, 12)); }
    catch { setNotice("Saved browser experiments could not be read."); }
    return () => controller.abort();
  }, []);
  const update = (patch: Partial<LabConfig>) => setConfig(previous => previous ? { ...previous, ...patch } : previous);
  const run = async () => {
    if (!config || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/internal/regime-lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Research failed.");
      setResult(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Research failed."); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!result || !name.trim()) return;
    const next = [{ id: crypto.randomUUID(), name: name.trim(), savedAt: new Date().toISOString(), config: result.config, dataset: result.dataset,
      rows: result.rows.map(r => ({ id: r.id, name: r.name, sharpe: r.metrics.sharpe, cagr: r.metrics.cagr })) }, ...saved].slice(0, 12);
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); setSaved(next); setNotice("Saved the applied settings and results in this browser."); }
    catch { setNotice("Browser storage is unavailable; export the result instead."); }
  };
  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ name, ...result }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `regime-lab-${result.generatedAt.slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const active = result?.rows.find(r => r.id === selected);
  const dirty = !!result && JSON.stringify(config) !== JSON.stringify(result.config);
  return <main className="min-h-screen bg-[#09121f] pb-16 font-sans text-slate-100">
    <header className="border-b border-white/10 bg-[#0d1726]"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-8"><div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-teal-300">A3RO / Internal research</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Regime testing board</h1></div><span className="rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1.5 text-[11px] text-teal-200">Local development only · live rules untouched</span></div></header>
    <div className="mx-auto max-w-[1500px] space-y-6 px-5 pt-6 md:px-8">
      <div className="max-w-4xl"><p className="text-sm leading-relaxed text-slate-300">Compare how the existing market-regime engine and asset trends translate into portfolio decisions. Start in 2022, examine the phases, and look for relationships that survive costs and the earlier/later split.</p><p className="mt-3 text-xs leading-relaxed text-amber-200/80">Historical regimes are monthly reconstructions; asset trend signals are daily. These independent research rules are not verified replicas of Dr. Mo. Correlations are exploratory.</p></div>
      {config && <section className={panel} aria-labelledby="settings-title"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="settings-title" className="font-medium">Experiment settings</h2><p className="text-xs text-slate-400">60% stocks / 30% gold / 10% Bitcoin · historical BIL cash</p></div>
        <fieldset disabled={busy} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-slate-400">Start date<input className={field} type="date" min="2015-01-01" max={config.to} value={config.from} onChange={e => update({ from: e.target.value })}/></label>
          <label className="text-xs text-slate-400">End date<input className={field} type="date" min={config.from} max={through} value={config.to} onChange={e => update({ to: e.target.value })}/></label>
          <label className="text-xs text-slate-400">Earlier / later split<input className={field} type="date" min={config.from} max={config.to} value={config.split} onChange={e => update({ split: e.target.value })}/></label>
          <label className="text-xs text-slate-400">Asset trend lookback<select className={field} value={config.trendWindow} onChange={e => update({ trendWindow: Number(e.target.value) as 21 | 63 })}><option value="21">21 daily observations</option><option value="63">63 daily observations</option></select></label>
          <label className="text-xs text-slate-400">Consecutive weekly confirmations<select className={field} value={config.confirmationWeeks} onChange={e => update({ confirmationWeeks: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} weekly review{n === 1 ? "" : "s"}</option>)}</select></label>
          <label className="text-xs text-slate-400">Severe headwind threshold<select className={field} value={config.headwindLimit} onChange={e => update({ headwindLimit: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} of 6 cycle headwinds</option>)}</select></label>
          <label className="text-xs text-slate-400">Forward correlation horizon<select className={field} value={config.horizon} onChange={e => update({ horizon: Number(e.target.value) as 5 | 21 | 63 })}>{[5, 21, 63].map(n => <option key={n} value={n}>{n} sessions · non-overlapping</option>)}</select></label>
          <label className="text-xs text-slate-400">Regime definition<select className={field} value={config.phaseBasis} onChange={e => update({ phaseBasis: e.target.value as LabConfig["phaseBasis"] })}><option value="market">Existing cross-asset market regime</option><option value="economic">Economic growth / inflation GRID</option></select></label>
          {([...assets, { key: "cash", label: "BIL cash" }] as const).map(a => <label key={a.key} className="text-xs text-slate-400">{a.label} · one-way total cost (bp)<input className={field} type="number" min="0" max="1000" step="1" value={config.costs[a.key]} onChange={e => update({ costs: { ...config.costs, [a.key]: Number(e.target.value) } })}/></label>)}
        </fieldset>
        <details className="mt-5 text-xs"><summary className="cursor-pointer text-slate-300">Favourable regimes by asset · explicit hypotheses, not fitted scores</summary><div className="mt-3 overflow-x-auto"><table className="w-full"><thead><tr><th scope="col" className={th}>Asset</th>{regimes.map(q => <th scope="col" key={q} className={th}>{phaseLabel(q)}</th>)}</tr></thead><tbody>{assets.map(a => <tr key={a.key}><th scope="row" className={`${td} text-left font-normal`}>{a.label}</th>{regimes.map(q => <td className={td} key={q}><input aria-label={`${a.label} favoured in ${phaseLabel(q)}`} type="checkbox" disabled={busy} className="h-4 w-4 accent-teal-300" checked={config.favourable[a.key].includes(q)} onChange={e => update({ favourable: { ...config.favourable, [a.key]: e.target.checked ? [...config.favourable[a.key], q] : config.favourable[a.key].filter(v => v !== q) } })}/></td>)}</tr>)}</tbody></table></div><p className="mt-2 text-slate-500">These assumptions control the regime-only, alignment and macro-entry rules. Changing them creates a new hypothesis; it does not establish an edge.</p></details>
        <div className="mt-5 flex flex-wrap items-center gap-4"><button disabled={busy} onClick={run} className="rounded-lg bg-teal-300 px-5 py-2.5 text-sm font-semibold text-[#09121f] disabled:opacity-40">{busy ? "Calculating…" : "Run comparison"}</button><p role="status" className="text-xs text-slate-400">{busy ? "Calculating seven portfolios and correlation diagnostics…" : dirty ? "Settings changed. Results below still show the last applied experiment." : result ? `Applied · ${result.rows[0].metrics.from} → ${result.through} · ${result.rows[0].metrics.steps.toLocaleString()} holding sessions` : "Ready"}</p></div>
      </section>}
      {error && <p role="alert" className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm text-rose-200">{error}</p>}
      {!config && busy && <p role="status" className="text-sm text-slate-400">Loading the internal board…</p>}
      {result && active && <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
          { label: "Sharpe requirement", value: "> 1.00", detail: "Net of costs; excess return versus BIL" },
          { label: "Benchmark to beat", value: ratio(result.rows[0].metrics.sharpe), detail: "Static 60/30/10 Sharpe · monthly rebalance" },
          { label: "Rules clearing the screen", value: `${result.rows.filter(r => r.screen === "Clears exploratory screen").length} / 5`, detail: "Sharpe > 1, positive advantage range, 0–3 moves each year" },
          { label: "Preferred activity", value: "0–3 moves / year", detail: "Directional campaigns, not individual orders" },
        ].map(card => <div key={card.label} className={panel}><p className="text-xs text-slate-400">{card.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-teal-100">{card.value}</p><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{card.detail}</p></div>)}</div>
        <nav aria-label="Research views" className="flex flex-wrap gap-2 border-b border-white/10 pb-3">{(["performance", "phases", "correlations", "trades"] as const).map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2.5 text-sm ${tab === t ? "bg-teal-300/15 text-teal-200" : "text-slate-400 hover:text-slate-100"}`}>{t === "trades" ? "Moves & executions" : phaseLabel(t)}</button>)}</nav>
        <label className="block max-w-lg text-xs text-slate-400">Rule to inspect<select className={field} value={selected} onChange={e => setSelected(e.target.value)}>{result.rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        {tab === "performance" && <><section className={panel}><h2 className="font-medium">Same-window performance after costs</h2><p className="mt-2 text-xs leading-relaxed text-slate-400">All hypotheses remain visible. A positive Sharpe difference alone is insufficient to establish an advantage. The 95% range uses paired blocks of daily returns and is exploratory.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-xs"><caption className="sr-only">Performance of five positioning rules and two static allocation benchmarks</caption><thead><tr>{["Portfolio / rule", "Sharpe", "Δ vs static", "95% Δ range", "CAGR", "Drawdown", "Avg invested", "Moves / yr", "Execution dates", "Earlier / later Sharpe", "Target screen"].map(h => <th className={th} scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{result.rows.map(r => <tr key={r.id} className={`border-t border-white/10 ${selected === r.id ? "bg-teal-300/5" : ""}`}><th scope="row" className={`${td} min-w-48 text-left font-normal`}><button className="text-left text-teal-100 underline decoration-teal-300/20 underline-offset-4" onClick={() => setSelected(r.id)}>{r.name}</button></th><td className={td}>{ratio(r.metrics.sharpe)}</td><td className={td}>{ratio(r.deltaSharpe)}</td><td className={`${td} whitespace-nowrap text-slate-400`}>{r.sharpeAdvantageRange?.map(ratio).join(" to ") ?? "—"}</td><td className={td}>{percent(r.metrics.cagr)}</td><td className={td}>{percent(r.metrics.maxDrawdown)}</td><td className={td}>{percent(r.metrics.averageInvested, 1)}</td><td className={td}>{r.id === "static" || r.id === "hold" ? "—" : r.campaignsPerYear.toFixed(1)}</td><td className={td}>{r.tradeDates}</td><td className={`${td} whitespace-nowrap`}>{ratio(r.earlier.sharpe)} / {ratio(r.later.sharpe)}</td><td className={`${td} min-w-40 ${r.screen === "Clears exploratory screen" ? "text-teal-200" : "text-amber-200/80"}`}>{r.screen}</td></tr>)}</tbody></table></div></section>
          <EquityPlot result={result} selected={selected}/><section className={panel}><h2 className="font-medium">What this rule does</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{active.description}</p><p className="mt-3 text-xs text-slate-400">Entry targets are full / half / zero of each sleeve&apos;s cap. Review weekly; trade only when a confirmed target changes. Targets stay unchanged between reviews while actual weights drift.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-xs"><caption className="sr-only">Selected rule performance by calendar year</caption><thead><tr>{["Year", "Return", "Sharpe", "Drawdown", "Moves started", "Execution dates"].map(h => <th className={th} key={h} scope="col">{h}</th>)}</tr></thead><tbody>{active.years.map(y => <tr key={y.year} className="border-t border-white/10"><th scope="row" className={`${td} text-left font-normal`}>{y.year}</th><td className={td}>{percent(y.metrics.totalReturn)}</td><td className={td}>{ratio(y.metrics.sharpe)}</td><td className={td}>{percent(y.metrics.maxDrawdown)}</td><td className={td}>{y.campaigns}</td><td className={td}>{y.tradeDates}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-slate-500">First and last years can be partial. Earlier/later intervals share one continuous simulation, split at {result.split}; this is not an untouched holdout after inspection.</p></section></>}
        {tab === "phases" && <PhaseTables result={result} selected={selected}/>}
        {tab === "correlations" && <LabCorrelations result={result} selected={selected}/>}
        {tab === "trades" && <section className={panel}><h2 className="font-medium">Directional moves and execution dates</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Full → half → zero counts as one defensive move; zero → half → full counts as one rebuilding move. Initial deployment is excluded from move counts but pays costs. Consecutive moves in the same direction form one campaign; a mixed-direction asset rotation counts separately.</p><div className="mt-4 flex flex-wrap gap-3 text-xs"><span className="rounded-lg bg-[#09121f] px-3 py-2">{active.campaigns.length} directional moves</span><span className="rounded-lg bg-[#09121f] px-3 py-2">{active.tradeDates} execution dates, including entry</span><span className="rounded-lg bg-[#09121f] px-3 py-2">{active.metrics.totalTurnover.toFixed(1)}× total traded notional</span><span className="rounded-lg bg-[#09121f] px-3 py-2">{active.frequencyWithinTarget === null ? "Benchmark" : active.frequencyWithinTarget ? "Within 0–3 starts in every year" : "Exceeds 3 starts in at least one year"}</span></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-xs"><thead><tr>{["Direction", "First → last execution", "Staged dates", "Target exposure", "Execution dates"].map(h => <th key={h} className={th} scope="col">{h}</th>)}</tr></thead><tbody>{active.campaigns.map(c => <tr key={c.from} className="border-t border-white/10"><th scope="row" className={`${td} text-left font-normal ${c.direction === "Defensive" ? "text-rose-200" : "text-teal-200"}`}>{c.direction}</th><td className={`${td} whitespace-nowrap`}>{c.from} → {c.to}</td><td className={td}>{c.legs}</td><td className={`${td} whitespace-nowrap`}>{percent(c.fromExposure, 0)} → {percent(c.toExposure, 0)}</td><td className={`${td} max-w-md text-slate-400`}>{c.dates.join(", ")}</td></tr>)}</tbody></table>{!active.campaigns.length && <p className="p-4 text-sm text-slate-400">This benchmark has no directional signal campaigns. Its execution count still includes initial purchases and any scheduled rebalances.</p>}</div></section>}
        <section className={panel}><div className="flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-xs text-slate-400">Experiment name<input className={field} maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label><button className={button} onClick={save} disabled={!name.trim() || busy || dirty}>Save applied experiment</button><button className={button} onClick={download} disabled={busy}>Export full results</button></div>{notice && <p role="status" className="mt-3 text-xs text-teal-200">{notice}</p>}{saved.length > 0 && <div className="mt-5 space-y-3">{saved.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-xs"><div><p className="text-slate-200">{s.name} · {s.savedAt.slice(0, 10)}</p><p className="mt-1 text-slate-500">{s.config.from} → {s.config.to} · {s.config.trendWindow} observations · {s.config.confirmationWeeks} confirmations · alignment Sharpe {ratio(s.rows.find(r => r.id === "alignment")?.sharpe)}</p></div><button className={button} disabled={busy} onClick={() => { setConfig(structuredClone(s.config)); setName(s.name); setNotice("Restored settings. Run comparison to recalculate against the current history."); }}>Restore settings</button></div>)}</div>}</section>
        <details className={panel}><summary className="cursor-pointer text-sm text-slate-300">Data provenance and interpretation</summary><p className="mt-4 text-xs text-slate-400">Price history through {result.dataset.through}; common execution window ends {result.through}. Macro dataset generated {result.dataset.generatedAt.slice(0, 10)}. Trend histories refreshed {result.dataset.vams63GeneratedAt?.slice(0, 10) ?? "unknown"}.</p><ul className="mt-4 list-disc space-y-3 pl-4 text-xs leading-relaxed text-slate-500">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul><p className="mt-4 text-xs text-slate-500">Method references: <a className="underline" href="https://www.nber.org/papers/w21329" target="_blank" rel="noreferrer">multiple-signal backtesting</a> · <a className="underline" href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pearsonr.html" target="_blank" rel="noreferrer">correlation interpretation</a>. Export retains all tested rules and dated observations.</p></details>
      </>}
    </div>
  </main>;
}
