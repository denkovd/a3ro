"use client";
import { useEffect, useMemo, useState } from "react";
import { BASELINE_SETTINGS, SLEEVES, type AllocationSettings, type Quadrant, type SleeveKey } from "../../../../backend/src/macro/allocation";
import { defaultResearchConfig, REGIMES, RESEARCH_VERSION, runResearch, type ResearchConfig,
  type ResearchDataset, type ResearchResult } from "../../../../backend/src/macro/backtestResearch";
import type { BacktestMetrics } from "../../../../backend/src/macro/allocationBacktest";
import BacktestChart from "./BacktestChart";
import { SP_BENCHMARK, BUY_HOLD_SELECTION_NOTE } from "../../../../backend/src/macro/researchBenchmarks";

const STORAGE_KEY = "a3ro.regime-backtests.v1";
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const label = (q: string) => q.charAt(0) + q.slice(1).toLowerCase();
const fieldClass = "mt-1 w-full rounded border border-[var(--line)] bg-[var(--depth-0)] px-3 py-2 text-sm text-[var(--ink)]";
const buttonClass = "rounded border border-[var(--line)] px-3 py-2 text-xs text-[var(--ink-2)] hover:border-[var(--ink-3)] disabled:opacity-40";
interface SavedRun {
  id: string; name: string; savedAt: string; dataGeneratedAt: string;
  config: ResearchConfig; candidate: BacktestMetrics; baseline: BacktestMetrics; benchmark: BacktestMetrics;
  modelVersion: string; baselineSettings: AllocationSettings;
  benchmarks?: Record<string, BacktestMetrics>;
  benchmarkGeneratedAt?: string;
  vams21GeneratedAt?: string;
}

export default function BacktestPanel() {
  const [dataset, setDataset] = useState<ResearchDataset | null>(null);
  const [config, setConfig] = useState<ResearchConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [saved, setSaved] = useState<SavedRun[]>([]);
  const [name, setName] = useState("Test strategy 1");
  const [notice, setNotice] = useState<string | null>(null);
  const [reference, setReference] = useState(SP_BENCHMARK);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    fetch("/data/regime-backtest.json", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Historical dataset is unavailable. Results will appear after the next research data refresh.");
        const data: ResearchDataset = await response.json();
        if (data.version !== RESEARCH_VERSION || !data.signals?.length || !data.prices?.stocks?.length) throw new Error("Historical dataset is incomplete or needs a refresh.");
        if (controller.signal.aborted) return;
        setDataset(data);
        setConfig(previous => previous ?? defaultResearchConfig(data.through));
      }).catch(error => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(stored)) setSaved(stored.filter(run => run?.id && typeof run.name === "string" && run.config && run.candidate && run.baseline && run.benchmark).slice(0, 20));
    } catch { setNotice("Saved browser runs could not be read. You can still export new results."); }
  }, []);
  const calculated = useMemo(() => {
    if (!dataset || !config) return { result: null, error: null };
    try { return { result: runResearch(dataset, config), error: null }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : "Unable to calculate this test strategy." }; }
  }, [dataset, config]);
  const result = calculated.result;
  const comparison = result?.candidate.benchmarks[reference] ? reference : SP_BENCHMARK;
  const update = (patch: Partial<ResearchConfig>) => setConfig(previous => previous ? { ...previous, ...patch } : previous);
  const setting = (key: SleeveKey, value: number) => {
    if (config) update({ settings: { ...config.settings, caps: { ...config.settings.caps, [key]: value } } });
  };
  const score = (key: SleeveKey, quadrant: Quadrant, value: number) => {
    if (config) update({ settings: { ...config.settings, regimeScores: { ...config.settings.regimeScores,
      [key]: { ...config.settings.regimeScores[key], [quadrant]: value } } } });
  };
  const save = () => {
    if (!config || !dataset || !result || !name.trim()) return;
    const run: SavedRun = { id: crypto.randomUUID(), name: name.trim(), savedAt: new Date().toISOString(), dataGeneratedAt: dataset.generatedAt,
      config: structuredClone(config), candidate: result.candidate.metrics, baseline: result.baseline.metrics,
      benchmark: result.candidate.benchmarks[SP_BENCHMARK], benchmarks: structuredClone(result.candidate.benchmarks), benchmarkGeneratedAt: dataset.benchmarkGeneratedAt, vams21GeneratedAt: dataset.vams21GeneratedAt,
      modelVersion: RESEARCH_VERSION, baselineSettings: structuredClone(BASELINE_SETTINGS) };
    const next = [run, ...saved].slice(0, 20);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaved(next); setNotice(`Saved “${run.name}” in this browser.`); }
    catch { setNotice("Browser storage is unavailable. Export the run to keep a copy."); }
  };
  const download = () => {
    if (!config || !dataset || !result) return;
    const blob = new Blob([JSON.stringify({ version: RESEARCH_VERSION, name, exportedAt: new Date().toISOString(),
      dataset: { generatedAt: dataset.generatedAt, benchmarkGeneratedAt: dataset.benchmarkGeneratedAt, vams21GeneratedAt: dataset.vams21GeneratedAt, through: dataset.through, sources: dataset.sources, warnings: dataset.warnings },
      baselineSettings: BASELINE_SETTINGS, config, result }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = `regime-backtest-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const remove = (id: string) => {
    const next = saved.filter(run => run.id !== id);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaved(next); setNotice("Saved comparison removed from this browser."); }
    catch { setNotice("Browser storage is unavailable; the saved comparison could not be removed."); }
  };
  return <section className="mt-12 border-t border-[var(--line)] pt-8" aria-labelledby="backtest-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#e0b969]">Research laboratory</p>
        <h2 id="backtest-heading" className="mt-2 text-2xl font-semibold text-[var(--ink)]">Regime performance vs S&P 500</h2></div>
      <button type="button" className={buttonClass} onClick={() => setReload(v => v + 1)}>Reload history</button>
    </div>
    <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[var(--ink-2)]">Current regime strategy uses the existing 63-day VAMS with macro and cycle filters. Your test strategy adjusts those rules below. The separate 60/30/10 · 21-day VAMS portfolio uses bullish/neutral/bearish exposure of 100%/50%/0%, with unused exposure in cash. Static 60/30/10 holds its fixed mix. Buy-and-hold comparisons include Bitcoin, NVIDIA, AMD, Broadcom, Arista, Axon, FICO, Netflix, Tesla, major technology stocks, Costco, Texas Pacific Land, gold, Nasdaq-100 and semiconductors. All comparisons use the same dates and costs, ranked by total return.</p>
    <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">{BUY_HOLD_SELECTION_NOTE}</p>
    {loadError ? <p role="alert" className="mt-5 text-sm text-[#e0b969]">{loadError}</p> : !dataset ? <p role="status" className="mt-5 text-sm text-[var(--ink-3)]">Loading historical signals and prices…</p> : null}
    {dataset && config && <>
      <p className="mt-4 text-xs text-[var(--ink-3)]">History through {dataset.through} · Refreshed {dataset.generatedAt.slice(0, 10)} · {RESEARCH_VERSION}{Date.now() - Date.parse(dataset.generatedAt) > 35 * 86400000 ? " · History needs a refresh" : ""}</p>
      {dataset.benchmarkGeneratedAt ? <p className="mt-1 text-xs text-[var(--ink-3)]">Benchmark prices refreshed {dataset.benchmarkGeneratedAt.slice(0, 10)}</p> : null}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[var(--ink-3)]">Asset universe<select className={fieldClass} value={config.universe} onChange={e => update({ universe: e.target.value as ResearchConfig["universe"], from: e.target.value === "all" ? "2015-01-01" : "2005-01-01" })}>
          <option value="all">Stocks, gold & Bitcoin (2015+)</option><option value="stocks-gold">Stocks & gold (2005+)</option></select></label>
        <label className="text-xs text-[var(--ink-3)]">Start date<input className={fieldClass} type="date" min={config.universe === "all" ? "2015-01-01" : "2005-01-01"} max={config.to} value={config.from} onChange={e => update({ from: e.target.value })} /></label>
        <label className="text-xs text-[var(--ink-3)]">End date<input className={fieldClass} type="date" min={config.from} max={dataset.through} value={config.to} onChange={e => update({ to: e.target.value })} /></label>
        <label className="text-xs text-[var(--ink-3)]">Validation starts<input className={fieldClass} type="date" min={config.from} max={config.to} value={config.testFrom} onChange={e => update({ testFrom: e.target.value })} /></label>
      </div>
      <details className="mt-5 rounded border border-[var(--line)] p-4" open>
        <summary className="cursor-pointer text-sm text-[var(--ink)]">Your test strategy settings</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {SLEEVES.map(s => <PercentField key={s.key} label={`${s.label} cap`} value={config.settings.caps[s.key]} onChange={v => setting(s.key, v)} />)}
          <label className="text-xs text-[var(--ink-3)]">Rebalance<select className={fieldClass} value={config.rebalance} onChange={e => update({ rebalance: e.target.value as ResearchConfig["rebalance"] })}>
            <option value="monthly-regime">Monthly + observed regime changes</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="regime">Observed regime changes only</option></select></label>
          <label className="text-xs text-[var(--ink-3)]">One-way cost (basis points)<input className={fieldClass} type="number" min="0" max="1000" value={config.costBps} onChange={e => update({ costBps: Number(e.target.value) })} /></label>
          <PercentField label="Annual cash return assumption" value={config.cashRate} max={25} onChange={v => update({ cashRate: v })} />
          <PercentField label="Maximum cycle reduction" value={config.settings.cycleDrag} onChange={v => update({ settings: { ...config.settings, cycleDrag: v } })} />
          {(["BULLISH", "NEUTRAL", "BEARISH"] as const).map(state => <PercentField key={state} label={`${label(state)} trend multiplier`} value={config.settings.vamsMultipliers[state]}
            onChange={v => update({ settings: { ...config.settings, vamsMultipliers: { ...config.settings.vamsMultipliers, [state]: v, ...(state === "NEUTRAL" ? { PENDING: v } : {}) } } })} />)}
        </div>
        <p className="mt-3 text-xs text-[var(--ink-3)]">Caps total {pct(Object.values(config.settings.caps).reduce((a, b) => a + b, 0))}; unallocated exposure stays in cash. Trading costs apply to every portfolio. The cash assumption applies to unallocated cash; bond and Treasury bill ETFs use their actual adjusted returns.</p>
        <details className="mt-4"><summary className="cursor-pointer text-xs text-[var(--ink-2)]">Exposure scores by regime</summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-3 text-left text-[var(--ink-3)]">Target = cap × regime score × trend multiplier × cycle adjustment. Gold is exempt from cycle reduction.</caption>
            <thead><tr><th scope="col" className="p-2 text-[var(--ink-3)]">Asset</th>{REGIMES.map(q => <th key={q} scope="col" className="p-2 text-[var(--ink-3)]">{label(q)}</th>)}</tr></thead>
            <tbody>{SLEEVES.map(s => <tr key={s.key}><th scope="row" className="p-2 text-[var(--ink-2)]">{s.label}</th>{REGIMES.map(q => <td key={q} className="min-w-24 p-2"><input aria-label={`${s.label} ${label(q)} exposure score percent`} className={fieldClass} type="number" min="0" max="100" step="1" value={Math.round(config.settings.regimeScores[s.key][q] * 100)} onChange={e => score(s.key, q, Number(e.target.value) / 100)} /></td>)}</tr>)}</tbody>
          </table></div></details>
        <button type="button" className={`${buttonClass} mt-4`} onClick={() => update({ settings: structuredClone(BASELINE_SETTINGS), rebalance: "monthly-regime" })}>Reset test strategy</button>
      </details>
      {calculated.error && <p role="alert" className="mt-4 text-sm text-[#e0b969]">{calculated.error}</p>}
      {result && <>
        {result.coverageNote ? <p role="status" className="mt-4 text-xs text-[#e0b969]">{result.coverageNote}</p> : null}
        <MetricsTable result={result} />
        <BacktestChart result={result} />
        <label className="mt-6 block max-w-md text-xs text-[var(--ink-3)]">Benchmark for detailed comparisons<select className={fieldClass} value={comparison} onChange={event => setReference(event.target.value)}>
          {Object.keys(result.candidate.benchmarks).map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {(["development", "validation"] as const).map(period => {
            const section = result[period];
            return <div key={period} className="rounded border border-[var(--line)] p-4"><h3 className="text-sm text-[var(--ink)]">{period === "development" ? "Earlier period" : "Later validation period"}</h3>
              <p className="mt-1 text-xs text-[var(--ink-3)]">{section.candidate.strategy.from || "No periods"} → {section.candidate.strategy.to || "—"} · {section.candidate.strategy.steps} trading days</p>
              <p className="mt-3 text-sm text-[#e0b969]">Your test CAGR {pct(section.candidate.strategy.cagr)}</p>
              <p className="mt-1 text-xs text-[var(--ink-2)]">Current regime CAGR {pct(section.baseline.strategy.cagr)}</p>
              <p className="mt-1 text-xs text-[var(--ink-2)]">{comparison}: {pct(section.candidate.benchmarks[comparison].cagr)}</p>
              <p className="mt-1 text-xs text-[var(--ink-3)]">Your test drawdown {pct(section.candidate.strategy.maxDrawdown)} · Benchmark drawdown {pct(section.candidate.benchmarks[comparison].maxDrawdown)}</p></div>;
          })}
        </div>
        <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-xs text-[var(--ink-2)]"><caption className="mb-3 text-left text-sm text-[var(--ink)]">Performance by regime</caption>
          <thead><tr className="border-b border-[var(--line)]">{["Regime", "Signal months", "Days", "Your test", "Current regime", comparison, "Win rate"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{result.regimes.map(r => <tr key={r.regime} className="border-b border-[var(--line)]"><th scope="row" className="p-2 font-normal">{label(r.regime)}{r.months > 0 && r.months < 12 ? <span className="block text-[10px] text-[#e0b969]">Small sample</span> : null}</th><td className="p-2">{r.months}</td><td className="p-2">{r.days}</td><td className="p-2">{r.days ? pct(r.candidate.totalReturn) : "—"}</td><td className="p-2">{r.days ? pct(r.baseline.totalReturn) : "—"}</td><td className="p-2">{r.days ? pct(r.benchmarks[comparison].totalReturn) : "—"}</td><td className="p-2">{r.days ? pct(r.candidate.hitRate) : "—"}</td></tr>)}</tbody>
        </table><p className="mt-2 text-xs text-[var(--ink-3)]">Returns compound only the days assigned to each observed regime. These disconnected periods are diagnostic, not separate investable strategies.</p></div>
        <details className="mt-6"><summary className="cursor-pointer text-sm text-[var(--ink)]">Yearly returns</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs text-[var(--ink-2)]">
          <thead><tr>{["Year", "Your test", "Current regime", comparison].map(h => <th scope="col" key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>{result.years.map(r => <tr key={r.year} className="border-t border-[var(--line)]"><th scope="row" className="p-2 font-normal">{r.year}</th><td className="p-2">{pct(r.candidate.totalReturn)}</td><td className="p-2">{pct(r.baseline.totalReturn)}</td><td className="p-2">{pct(r.benchmarks[comparison].totalReturn)}</td></tr>)}</tbody>
        </table><p className="mt-2 text-xs text-[var(--ink-3)]">First and last years may be partial. Each return is assigned to its ending date.</p></div></details>
        <div className="mt-6 flex flex-wrap items-end gap-3"><label className="min-w-48 text-xs text-[var(--ink-3)]">Version name<input className={fieldClass} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
          <button type="button" className={buttonClass} onClick={save} disabled={!name.trim()}>Save comparison</button><button type="button" className={buttonClass} onClick={download}>Export full result</button></div>
      </>}
      {saved.length > 0 && <div className="mt-6"><h3 className="text-sm text-[var(--ink)]">Saved comparisons in this browser</h3><div className="mt-3 space-y-2">{saved.map(run => <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-[var(--line)] p-3 text-xs">
        <div className="text-[var(--ink-2)]"><p>{run.name} · {run.savedAt.slice(0, 10)}</p><p className="mt-1 text-[var(--ink-3)]">CAGR: your test {pct(run.candidate.cagr)} · current regime {pct(run.baseline.cagr)} · S&P {pct(run.benchmark.cagr)} · History {run.dataGeneratedAt.slice(0, 10)}</p></div>
        <div className="flex gap-2"><button type="button" className={buttonClass} onClick={() => { setConfig(structuredClone(run.config)); setName(run.name); setNotice("Restored settings; results are recalculated against the currently loaded history."); }}>Restore settings</button><button type="button" aria-label={`Remove ${run.name}`} className={buttonClass} onClick={() => remove(run.id)}>Remove</button></div>
      </div>)}</div></div>}
      {notice && <p role="status" className="mt-3 text-xs text-[#e0b969]">{notice}</p>}
      <details className="mt-6 rounded border border-[#e0b969]/30 p-4" open><summary className="cursor-pointer text-sm text-[#e0b969]">Research assumptions and limits</summary><ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-relaxed text-[var(--ink-3)]">
        {dataset.warnings.map(warning => <li key={warning}>{warning}</li>)}
        <li>Daily equity-session marks; Bitcoin weekend moves appear in the next equity-session mark. Each asset uses its own daily close on the execution date, so cross-market prices are asynchronous. Slippage is included only through the selected cost assumption.</li>
        <li>Saving or restoring test settings keeps the live allocation rules unchanged. A live rule change needs a separate reviewed configuration update.</li>
      </ul></details>
    </>}
  </section>;
}

function PercentField({ label: name, value, onChange, max = 100 }: { label: string; value: number; onChange: (value: number) => void; max?: number }) {
  return <label className="text-xs text-[var(--ink-3)]">{name} (%)<input className={fieldClass} type="number" min="0" max={max} step="0.1" value={Number((value * 100).toFixed(4))} onChange={e => onChange(Number(e.target.value) / 100)} /></label>;
}
function MetricsTable({ result }: { result: ResearchResult }) {
  const rows = [{ name: "Your test strategy", metrics: result.candidate.metrics, reason: null },
    { name: "Current regime strategy", metrics: result.baseline.metrics, reason: null },
    ...result.benchmarkAvailability.map(benchmark => ({ name: benchmark.name,
      metrics: result.candidate.benchmarks[benchmark.name], reason: benchmark.reason }))]
    .sort((a, b) => a.metrics && b.metrics ? b.metrics.totalReturn - a.metrics.totalReturn : a.metrics ? -1 : b.metrics ? 1 : 0);
  return <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-xs text-[var(--ink-2)]"><caption className="mb-3 text-left text-sm text-[var(--ink)]">Same-window performance · {result.candidate.metrics.from} → {result.candidate.metrics.to}</caption>
    <thead><tr className="border-b border-[var(--line)]">{["Portfolio", "Total return", "CAGR", "Max drawdown", "Volatility", "Return / vol"].map(h => <th scope="col" key={h} aria-sort={h === "Total return" ? "descending" : undefined} className="whitespace-nowrap p-2">{h}{h === "Total return" ? " ↓" : ""}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.name} className="border-b border-[var(--line)]" style={row.name === "Your test strategy" ? { color: "#e0b969" } : undefined}><th scope="row" className="whitespace-nowrap p-2 font-normal">{row.name}</th>
      {row.metrics ? <><td className="p-2">{pct(row.metrics.totalReturn)}</td><td className="p-2">{pct(row.metrics.cagr)}</td><td className="p-2">{pct(row.metrics.maxDrawdown)}</td><td className="p-2">{pct(row.metrics.volatility)}</td><td className="p-2">{row.metrics.returnToVol.toFixed(2)}</td></>
        : <td colSpan={5} className="p-2 text-[var(--ink-3)]">Unavailable for this window: {row.reason}</td>}</tr>)}</tbody>
  </table><p className="mt-2 text-xs text-[var(--ink-3)]">Excess total return vs S&P: {((result.candidate.metrics.totalReturn - result.candidate.benchmarks[SP_BENCHMARK].totalReturn) * 100).toFixed(1)} percentage points · Average invested {pct(result.candidate.metrics.averageInvested)} · Turnover {result.candidate.metrics.totalTurnover.toFixed(1)}× (sum of traded weight per rebalance). Return / vol is CAGR divided by volatility, not Sharpe.</p>
    <details className="mt-4"><summary className="cursor-pointer text-sm text-[var(--ink)]">What each benchmark holds</summary><dl className="mt-3 space-y-4 text-xs leading-relaxed">
      {result.benchmarkAvailability.map(benchmark => <div key={benchmark.name}><dt className="font-medium text-[var(--ink-2)]">{benchmark.name}</dt><dd className="mt-1 text-[var(--ink-3)]">{benchmark.description}
        {benchmark.sourceUrl ? <> <a href={benchmark.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">Background</a></> : null}
      </dd></div>)}
    </dl><p className="mt-4 text-xs text-[var(--ink-3)]">Stock and ETF histories use split- and dividend-adjusted closes with distributions reinvested. ETF returns include embedded fund fees, before taxes. Buy-and-hold benchmarks purchase once and hold without rebalancing or leverage; static allocation models rebalance monthly. The 21-day VAMS portfolio also trades on daily signal changes. All portfolios pay the same cost per traded dollar. Bitcoin uses equity-session marks, so weekend drawdown extremes can be missed. Unavailable histories are excluded from charts and detailed comparisons.</p></details>
  </div>;
}
