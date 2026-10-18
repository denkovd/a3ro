"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import HorizonChart, { type HorizonChartSeries } from "../../components/projects/horizon/HorizonChart";
import AustraliaBaseline from "../../components/projects/horizon/AustraliaBaseline";
import { HORIZON_ACCENT, horizonChange, horizonNumber, useHorizonBaseline } from "../../components/projects/horizon/horizonData";
import type { HorizonRead } from "../../../backend/src/horizon/types";
import type { HorizonScenarioInputs } from "../../../backend/src/horizon/scenarios";

const SOURCE_LABELS = { bls: "Bureau of Labor Statistics", bea: "Bureau of Economic Analysis", dfa: "Federal Reserve" };
const COLORS = ["#8b9dff", "#d4a157", "#5fc9a4"];
const EMPTY_READINGS: HorizonRead[] = [];
const HorizonScenarios = dynamic(() => import("../../components/projects/horizon/HorizonScenarios"), { loading: () => <p className="py-10 text-sm text-[var(--ink-2)]">Loading scenario workspace…</p> });
const HorizonStress = dynamic(() => import("../../components/projects/horizon/HorizonStress"), { loading: () => <p className="py-10 text-sm text-[var(--ink-2)]">Loading stress workspace…</p> });
const HorizonThemes = dynamic(() => import("../../components/projects/horizon/HorizonThemes"), { loading: () => <p className="py-10 text-sm text-[var(--ink-2)]">Loading theme workspace…</p> });
const UPCOMING = [
  { label: "AI adoption", detail: "Business adoption and realised economics", source: "https://www.census.gov/hfp/btos/data_downloads" },
  { label: "Regional power", detail: "Dependable capacity, connections and delivery dates", source: "https://www.nerc.com/our-work/assessments" },
  { label: "Household budgets", detail: "Matched income and essential expenses", source: "https://www.bea.gov/data/special-topics/distribution-of-personal-income" },
];

function chartSeries(readings: HorizonRead[], keys: string[], years: number): HorizonChartSeries[] {
  return keys.map((key, index) => {
    const reading = readings.find(indicator => indicator.key === key);
    const latestYear = Number(reading?.latest?.period.slice(0, 4));
    return { key, label: reading?.title ?? key, color: COLORS[index], points: reading?.points.filter(point => Number(point.period.slice(0, 4)) >= latestYear - years + 1) ?? [] };
  });
}

function SourceDetails({ indicator }: { indicator: HorizonRead }) {
  return <details className="mt-5 border-t border-[var(--line)] pt-4 text-xs leading-6 text-[var(--ink-2)]">
    <summary className="cursor-pointer">Definition, source and observation values</summary>
    <p className="mt-3">{indicator.population}. {indicator.basis}. {indicator.adjustment}.</p>
    <p className="mt-2">{indicator.note}</p>
    <p className="mt-2">Source: {SOURCE_LABELS[indicator.source]} · {indicator.sourceSeries}</p>
    <p>Last verified: {indicator.verifiedAt ? new Date(indicator.verifiedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "Unavailable"}. Publication date: {indicator.publicationDate ?? "Not supplied by this download"}.</p>
    {indicator.latest?.status && <p>Source status: {indicator.latest.status}.</p>}
    <div className="mt-3 flex flex-wrap gap-5"><a className="underline" href={indicator.sourceUrl} target="_blank" rel="noreferrer">Source methodology ↗</a>{indicator.dataUrl && <a className="underline" href={indicator.dataUrl} target="_blank" rel="noreferrer">Official data endpoint ↗</a>}</div>
    <div className="mt-4 max-h-60 overflow-auto"><table className="w-full text-left"><caption className="sr-only">{indicator.title} observation history</caption><thead><tr><th className="py-2 font-normal">Period</th><th className="text-right font-normal">Value</th></tr></thead><tbody>{[...indicator.points].reverse().map(point => <tr key={point.period} className="border-t border-[var(--line)]"><td className="py-2">{point.period}</td><td className="text-right font-mono tabular-nums">{horizonNumber(point.value, indicator.unit, 2)}</td></tr>)}</tbody></table></div>
  </details>;
}

export default function MacroHorizonView() {
  const { snapshot, loading, error, retry } = useHorizonBaseline();
  const [tab, setTab] = useState<"us" | "scenarios" | "stress" | "themes" | "australia" | "sources">("us");
  const [scenariosOpened, setScenariosOpened] = useState(false);
  const [stressOpened, setStressOpened] = useState(false);
  const [themesOpened, setThemesOpened] = useState(false);
  const [scenarioInputs, setScenarioInputs] = useState<HorizonScenarioInputs | null>(null);
  const selectTab = (next: typeof tab) => {
    if (next === "scenarios") setScenariosOpened(true);
    if (next === "stress") setStressOpened(true);
    if (next === "themes") setThemesOpened(true);
    setTab(next);
  };
  const [years, setYears] = useState(10);
  const [distribution, setDistribution] = useState<"income" | "wealth">("income");
  const [selectedKey, setSelectedKey] = useState("real_median_dpi");
  const readings = snapshot?.indicators ?? EMPTY_READINGS;
  const selected = readings.find(indicator => indicator.key === selectedKey);
  const capacitySeries = useMemo(() => chartSeries(readings, ["productivity", "real_compensation"], years), [readings, years]);
  const distributionSeries = useMemo(() => chartSeries(readings, distribution === "income" ? ["income_bottom40", "income_middle40", "income_top20"] : ["wealth_top1", "wealth_bottom50"], years), [readings, years, distribution]);
  const historySeries = useMemo(() => chartSeries(readings, [selectedKey], years), [readings, selectedKey, years]);
  const summaries = [
    { key: "productivity", label: "Productive capacity", changeFirst: true },
    { key: "real_compensation", label: "Real hourly compensation", changeFirst: true },
    { key: "income_bottom40", label: "Bottom 40% income share", changeFirst: false },
  ];

  return <main className="grain min-h-screen bg-[var(--depth-0)] text-[var(--ink)]">
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[rgba(6,7,7,.94)] backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-10"><div className="flex items-center gap-4"><Link href="/#modules" className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--ink-2)]">← Index</Link><span className="text-[var(--ink-3)]">/</span><span className="font-mono text-[10px] uppercase tracking-[.15em]">Macro Horizon</span></div><ModuleSwitcher current="horizon" /></div>
    </header>
    <div className="mx-auto max-w-7xl px-5 py-9 md:px-10 md:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4"><p className="font-mono text-[10px] uppercase tracking-[.26em] text-[var(--ink-2)]">Structural outlook · 2026–2046</p><span className="border border-[var(--line-2)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.15em]" style={{ color: HORIZON_ACCENT }}>Stage 04 · Investment themes</span></div>
      <h1 className="mt-5 text-4xl font-medium tracking-tight md:text-6xl">Who shares in the gains?</h1>
      <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--ink-2)]">Can AI increase society’s productive capacity faster than energy constraints, concentrated ownership and institutional adjustment undermine broadly shared living standards?</p>
      <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3 font-mono text-[10px] uppercase tracking-[.12em] text-[var(--ink-2)]" aria-label="Module build stages"><button type="button" onClick={() => selectTab("us")} className="min-h-8" style={{ color: HORIZON_ACCENT }}>01 Baseline</button><button type="button" onClick={() => selectTab("scenarios")} className="min-h-8" style={{ color: HORIZON_ACCENT }}>02 Scenarios</button><button type="button" onClick={() => selectTab("stress")} className="min-h-8" style={{ color: HORIZON_ACCENT }}>03 Stress</button><button type="button" onClick={() => selectTab("themes")} className="min-h-8" style={{ color: HORIZON_ACCENT }}>04 Themes</button></div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-y border-[var(--line)] py-4">
        <nav aria-label="Module views" className="flex flex-wrap gap-2">{([{ key: "us", label: "US baseline" }, { key: "scenarios", label: "Future scenarios" }, { key: "stress", label: "Stress & ledger" }, { key: "themes", label: "Themes & expectations" }, { key: "australia", label: "Australia" }, { key: "sources", label: "Sources & method" }] as const).map(item => <button type="button" key={item.key} aria-pressed={tab === item.key} onClick={() => selectTab(item.key)} className={`min-h-10 rounded-sm px-3 text-xs transition-colors ${tab === item.key ? "bg-[var(--depth-3)] text-[var(--ink)]" : "text-[var(--ink-2)] hover:text-[var(--ink)]"}`}>{item.label}</button>)}</nav>
        <span className="font-mono text-[10px] text-[var(--ink-2)]" role="status">{loading ? "Checking official observations…" : snapshot ? `${snapshot.coverage.available}/${snapshot.coverage.total} US series available · ${snapshot.coverage.current} within freshness window` : "Baseline unavailable"}</span>
      </div>

      {error && <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-amber-300/30 p-4 text-sm text-amber-200" role="alert"><p>{error}{snapshot ? " The last loaded readings remain visible." : ""}</p><button type="button" onClick={retry} className="min-h-10 underline">Try again</button></div>}

      <div className="mt-8">
        <div hidden={tab !== "scenarios"}>{scenariosOpened && <HorizonScenarios snapshot={snapshot} loading={loading} scenarioInputs={scenarioInputs} onInputsChange={setScenarioInputs} />}</div>
        <div hidden={tab !== "stress"}>{stressOpened && <HorizonStress snapshot={snapshot} loading={loading} scenarioInputs={scenarioInputs} onRefresh={retry} />}</div>
        <div hidden={tab !== "themes"}>{themesOpened && <HorizonThemes snapshot={snapshot} scenarioInputs={scenarioInputs} onOpenStress={() => selectTab("stress")} />}</div>
        {tab === "scenarios" || tab === "stress" || tab === "themes" ? null : tab === "australia" ? <AustraliaBaseline /> : tab === "sources" ? <section>
          <h2 className="text-2xl">What this baseline can tell us</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--ink-2)]">These are historical observations and official statistical estimates. Productivity does not identify AI’s causal contribution; income shares do not measure household spending room; wealth groups differ from income groups. Each view keeps its own reference periods and units.</p>
          <div className="mt-7 grid gap-4 md:grid-cols-3">{snapshot?.sources.map(source => <article key={source.source} className="border border-[var(--line)] p-5"><h3 className="text-sm">{SOURCE_LABELS[source.source]}</h3><p className="mt-3 font-mono text-xs" style={{ color: source.health === "healthy" ? HORIZON_ACCENT : "#d4a157" }}>{source.health}</p><p className="mt-3 text-xs leading-6 text-[var(--ink-2)]">Checked: {source.checkedAt ? source.checkedAt.slice(0, 16).replace("T", " ") + " UTC" : "Not yet checked"}</p>{source.error && <p className="mt-2 text-xs text-amber-200">{source.error}</p>}</article>)}</div>
          <div className="mt-7 space-y-3 text-sm leading-7 text-[var(--ink-2)]"><p>Freshness is an estimated window from period end: monthly 75 days, quarterly 170 days and annual 660 days. Aging windows extend to 110, 230 and 790 days respectively. These are documented monitoring rules, rather than confirmed release calendars.</p><p>Downloads do not supply reliable publication timestamps for every observation. Retrieval time is shown separately. Annual BEA estimates may be provisional, and quarterly wealth estimates incorporate survey interpolation and estimation.</p><p>{snapshot?.archive === "available" ? "A revision archive is available. Source checks can include newer readings awaiting the next archival run." : "Revision archiving is unavailable for this view. The readings use current source histories, which can contain revisions."} Historical charts describe the currently retrieved history and should not be treated as information available on past trading dates.</p><p>Income after essentials requires matched cash-income and expenditure data. That measure is awaiting compatible data; national-accounts income is not automatically a cash budget.</p></div>
          <div className="mt-8 space-y-3">{readings.map(indicator => <article key={indicator.key} className="border border-[var(--line)] p-5"><h3 className="text-sm">{indicator.title}</h3><SourceDetails indicator={indicator} /></article>)}</div>
        </section> : !snapshot ? <div className="grid gap-5 py-5 md:grid-cols-3" aria-busy={loading}>{summaries.map(item => <div key={item.key} className="h-36 border border-[var(--line)] bg-[var(--depth-1)] p-5"><p className="text-xs text-[var(--ink-2)]">{item.label}</p><p className="mt-6 font-mono text-sm text-[var(--ink-2)]">{loading ? "Loading observations…" : "Unavailable"}</p></div>)}</div> : <>
          <div className="grid gap-4 md:grid-cols-3">{summaries.map(item => {
            const indicator = readings.find(reading => reading.key === item.key);
            return <article key={item.key} className="border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><p className="text-xs text-[var(--ink-2)]">{item.label}</p><p className="mt-4 font-mono text-3xl tabular-nums tracking-tight">{item.changeFirst ? indicator?.annualChange == null ? "—" : `${indicator.annualChange > 0 ? "+" : ""}${indicator.annualChange.toFixed(1)}%` : horizonNumber(indicator?.latest?.value ?? null, "percent")}</p><p className="mt-3 text-xs leading-6 text-[var(--ink-2)]">{item.changeFirst ? "Change over one year" : "Share of disposable personal income"} · {indicator?.latest?.period ?? "No observation"}</p><p className="mt-1 font-mono text-[10px] text-[var(--ink-2)]">{indicator?.freshness ?? "unavailable"} · {indicator?.sourceHealth ?? "unavailable"} source</p></article>;
          })}</div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl">The evidence so far</h2><p className="mt-2 text-xs text-[var(--ink-2)]">Different populations and deflators explain part of the distance between these measures.</p></div><label className="flex items-center gap-3 text-xs text-[var(--ink-2)]">History<select aria-label="History window" value={years} onChange={event => setYears(Number(event.target.value))} className="min-h-10 rounded-sm border border-[var(--line-2)] bg-[var(--depth-1)] px-3 text-[var(--ink)]"><option value={5}>5 years</option><option value={10}>10 years</option></select></label></div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <article className="min-w-0 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><h3 className="text-base">Output and worker compensation</h3><p className="mb-5 mt-2 text-xs leading-6 text-[var(--ink-2)]">US nonfarm business sector · indexed to the first shared quarter</p><HorizonChart series={capacitySeries} unit="index" indexed /><p className="mt-4 text-xs leading-6 text-[var(--ink-2)]">Output per hour and consumer-price-adjusted compensation. Their gap is descriptive; it is not a measure of gains captured by owners or caused by AI.</p></article>
            <article className="min-w-0 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base">Who receives the gains?</h3><p className="mt-2 text-xs text-[var(--ink-2)]">{distribution === "income" ? "Annual disposable income · income-ranked groups" : "Quarterly net worth · wealth-ranked groups"}</p></div><div className="flex gap-1">{(["income", "wealth"] as const).map(value => <button type="button" key={value} aria-pressed={distribution === value} onClick={() => setDistribution(value)} className={`min-h-10 px-3 text-xs capitalize ${distribution === value ? "bg-[var(--depth-3)]" : "text-[var(--ink-2)]"}`}>{value}</button>)}</div></div><HorizonChart series={distributionSeries} unit="%" /><p className="mt-4 text-xs leading-6 text-[var(--ink-2)]">{distribution === "income" ? "Shares of aggregate disposable personal income. Changes in shares do not establish real income gains or losses within a group." : "Net worth includes illiquid assets and liabilities. The bottom 50% by wealth is a different population from the bottom 40% by income."}</p></article>
          </div>

          <section className="mt-10" aria-label="Baseline observations"><h2 className="text-xl">Inspect an observation</h2><p className="mt-2 text-xs text-[var(--ink-2)]">Select a measure to see its history, definition and source.</p><div className="mt-5 grid gap-5 lg:grid-cols-2"><div className="min-w-0 border border-[var(--line)]">{readings.map(indicator => <button type="button" key={indicator.key} onClick={() => setSelectedKey(indicator.key)} aria-pressed={selectedKey === indicator.key} className={`flex min-h-20 w-full items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-3 text-left last:border-0 ${selectedKey === indicator.key ? "bg-[var(--depth-3)]" : "hover:bg-[var(--depth-1)]"}`}><div className="min-w-0"><span className="block text-sm">{indicator.title}</span><span className="mt-1 block text-[11px] leading-5 text-[var(--ink-2)]">{indicator.latest?.period ?? "Awaiting observations"} · {indicator.freshness}{indicator.sourceHealth !== "healthy" ? ` · ${indicator.sourceHealth} source` : ""}</span></div><div className="shrink-0 text-right"><span className="block font-mono text-sm tabular-nums">{horizonNumber(indicator.latest?.value ?? null, indicator.unit)}</span><span className="mt-1 block text-[10px] text-[var(--ink-2)]">{indicator.unit === "usd2017" ? "2017 USD" : indicator.unit === "index" ? "source index" : "share / rate"}</span></div></button>)}</div>
            {selected && <article className="min-w-0 self-start border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--ink-2)]">{selected.area} · {selected.frequency}</p><h3 className="mt-3 text-xl">{selected.title}</h3><p className="mt-4 font-mono text-3xl tabular-nums">{horizonNumber(selected.latest?.value ?? null, selected.unit)}</p><p className="mb-6 mt-2 text-xs text-[var(--ink-2)]">{horizonChange(selected.annualChange, selected.change)} · {selected.latest?.period ?? "Unavailable"}</p><HorizonChart series={historySeries} unit={selected.unit === "percent" ? "%" : selected.unit === "usd2017" ? "2017 USD" : "source index"} /><SourceDetails indicator={selected} /></article>}
          </div></section>

          <section className="mt-10 border-t border-[var(--line)] pt-8"><h2 className="text-xl">Where the baseline needs more evidence</h2><div className="mt-5 grid gap-4 md:grid-cols-3">{UPCOMING.map(item => <article key={item.label} className="border border-[var(--line)] p-5"><p className="font-mono text-[10px] uppercase tracking-[.12em] text-[var(--ink-2)]">Awaiting integration</p><h3 className="mt-3 text-base">{item.label}</h3><p className="mt-2 text-xs leading-6 text-[var(--ink-2)]">{item.detail}</p><a href={item.source} target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs underline text-[var(--ink-2)]">Planned primary source ↗</a></article>)}</div><p className="mt-5 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">The current baseline establishes context. These gaps prevent a defensible answer about AI’s net contribution to broadly shared living standards. Scenario paths and stress thresholds will build on this evidence.</p></section>
        </>}
      </div>
    </div>
  </main>;
}
