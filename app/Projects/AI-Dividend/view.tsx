"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import DividendChart, { type DividendChartSeries } from "../../components/projects/dividend/DividendChart";
import AustraliaBaseline from "../../components/projects/dividend/AustraliaBaseline";
import ValueChainPanel from "../../components/projects/dividend/ValueChainPanel";
import ConstraintsPanel from "../../components/projects/dividend/ConstraintsPanel";
import OutlookPanel from "../../components/projects/dividend/OutlookPanel";
import { AdoptionPanel, CapabilityPanel, ConversionPanel, EntryLevelPanel, useSignals } from "../../components/projects/dividend/SignalsPanels";
import { DIVIDEND_ACCENT, dividendChange, dividendNumber, useDividendBaseline } from "../../components/projects/dividend/dividendData";
import { DIVIDEND_BUILD_STEPS, DIVIDEND_CURRENT_STEP, DIVIDEND_OUTLOOK_END_YEAR, DIVIDEND_STAGES, nextStageStep, stageStatus, type DividendBuildStep, type DividendStage, type DividendStageId } from "../../../backend/src/dividend/framework";
import type { DividendRead } from "../../../backend/src/dividend/types";
import SiteFooter from "../../components/SiteFooter";
import NewsletterSignup from "../../components/NewsletterSignup";
import { DataAsOf } from "../../components/DataAsOf";
import ModuleIntro from "../../components/ModuleIntro";

const SOURCE_LABELS = { bls: "Bureau of Labor Statistics", bea: "Bureau of Economic Analysis", dfa: "Federal Reserve" };
const COLORS = ["#8b9dff", "#d4a157", "#5fc9a4"];
const EMPTY_READINGS: DividendRead[] = [];
const AMBER = "#d4a157";
type View = DividendStageId | "australia" | "sources";

function chartSeries(readings: DividendRead[], keys: string[], years: number): DividendChartSeries[] {
  return keys.map((key, index) => {
    const reading = readings.find(indicator => indicator.key === key);
    const latestYear = Number(reading?.latest?.period.slice(0, 4));
    return { key, label: reading?.title ?? key, color: COLORS[index], points: reading?.points.filter(point => Number(point.period.slice(0, 4)) >= latestYear - years + 1) ?? [] };
  });
}

function formatChange(indicator: DividendRead | undefined): string {
  if (indicator?.annualChange == null) return "—";
  const sign = indicator.annualChange > 0 ? "+" : "";
  return `${sign}${indicator.annualChange.toFixed(indicator.change === "percentage_points" ? 2 : 1)}${indicator.change === "percentage_points" ? " pp" : "%"}`;
}

function SourceDetails({ indicator }: { indicator: DividendRead }) {
  return <details className="mt-5 border-t border-[var(--line)] pt-4 text-xs leading-6 text-[var(--ink-2)]">
    <summary className="cursor-pointer">Definition, source and observation values</summary>
    <p className="mt-3">{indicator.population}. {indicator.basis}. {indicator.adjustment}.</p>
    <p className="mt-2">{indicator.note}</p>
    {indicator.changeEstimated && <p className="mt-2">The source published no figure for {indicator.changeFromPeriod}, so the one-year change uses the average of the months either side.</p>}
    <p className="mt-2">Source: {SOURCE_LABELS[indicator.source]} · {indicator.sourceSeries}</p>
    <p>Last verified: {indicator.verifiedAt ? new Date(indicator.verifiedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "Unavailable"}. Publication date: {indicator.publicationDate ?? "Not supplied by this download"}.</p>
    {indicator.latest?.status && <p>Source status: {indicator.latest.status}.</p>}
    <div className="mt-3 flex flex-wrap gap-5"><a className="underline" href={indicator.sourceUrl} target="_blank" rel="noreferrer">Source methodology ↗</a>{indicator.dataUrl && <a className="underline" href={indicator.dataUrl} target="_blank" rel="noreferrer">Official data endpoint ↗</a>}</div>
    <div className="mt-4 max-h-60 overflow-auto"><table className="w-full text-left"><caption className="sr-only">{indicator.title} observation history</caption><thead><tr><th className="py-2 font-normal">Period</th><th className="text-right font-normal">Value</th></tr></thead><tbody>{[...indicator.points].reverse().map(point => <tr key={point.period} className="border-t border-[var(--line)]"><td className="py-2">{point.period}</td><td className="text-right font-mono tabular-nums">{dividendNumber(point.value, indicator.unit, 2)}</td></tr>)}</tbody></table></div>
  </details>;
}

function StatusChip({ stage }: { stage: DividendStage }) {
  const status = stageStatus(stage);
  const label = status === "complete" ? "Live" : status === "partial" ? "Partial data" : `Step ${nextStageStep(stage)}`;
  return <span className="font-mono text-[9px] uppercase tracking-[.12em]" style={{ color: status === "planned" ? "var(--ink-3)" : DIVIDEND_ACCENT }}>{label}</span>;
}

function StageHeader({ stage }: { stage: DividendStage }) {
  return <div className="max-w-3xl"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--ink-2)]">Stage {DIVIDEND_STAGES.indexOf(stage) + 1} · {stage.title}</p><h2 className="mt-3 text-2xl md:text-3xl">{stage.question}</h2></div>;
}

/** What a stage still needs. Shown openly for planned stages, as a footer for partial ones, and not at all once complete. */
function StagePlan({ stage }: { stage: DividendStage }) {
  const status = stageStatus(stage);
  const pending = stage.measures.filter(measure => measure.step > DIVIDEND_CURRENT_STEP);
  if (status === "complete") return null;
  const steps = [...new Set(pending.map(measure => measure.step))].sort() as DividendBuildStep[];
  return <section className={`${status === "planned" ? "mt-8" : "mt-10 border-t border-[var(--line)] pt-8"}`} aria-label={`${stage.title} build plan`}>
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-base">{status === "planned" ? "Not measured yet" : "Still to build"}</h3><p className="font-mono text-[10px] uppercase tracking-[.12em] text-[var(--ink-2)]">{steps.map(step => `Build step ${step} · ${DIVIDEND_BUILD_STEPS[step]}`).join(" / ")}</p></div>
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <div className="border border-[var(--line)] p-5"><p className="text-xs text-[var(--ink-2)]">Will measure</p><ul className="mt-3 space-y-2 text-sm leading-6">{pending.map(item => <li key={item.label}>— {item.label}{steps.length > 1 ? <span className="text-[var(--ink-2)]"> · step {item.step}</span> : null}</li>)}</ul></div>
      <div className="border border-[var(--line)] p-5"><p className="text-xs text-[var(--ink-2)]">Planned sources</p>{stage.sources.length ? <ul className="mt-3 space-y-2 text-sm leading-6">{stage.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-[var(--line-2)] underline-offset-4">{source.label} ↗</a></li>)}</ul> : <p className="mt-3 text-sm leading-6 text-[var(--ink-2)]">Built from the measured stages before it. Scenarios and predictions are dated and scored as new data arrives.</p>}</div>
    </div>
  </section>;
}

function Tile({ label, value, detail, meta }: { label: string; value: string; detail: string; meta: string }) {
  return <article className="border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><p className="text-xs text-[var(--ink-2)]">{label}</p><p className="mt-4 font-mono text-3xl tabular-nums tracking-tight">{value}</p><p className="mt-3 text-xs leading-6 text-[var(--ink-2)]">{detail}</p><p className="mt-1 font-mono text-[10px] text-[var(--ink-2)]">{meta}</p></article>;
}

function indicatorMeta(indicator: DividendRead | undefined): string {
  return `${indicator?.changeEstimated ? "Year-earlier month estimated (not published) · " : ""}${indicator?.latest?.period ?? "No observation"} · ${indicator?.freshness ?? "unavailable"} · ${indicator?.sourceHealth ?? "unavailable"} source`;
}

function Inspector({ readings, keys, years }: { readings: DividendRead[]; keys: string[]; years: number }) {
  const list = keys.flatMap(key => readings.filter(indicator => indicator.key === key));
  const [selectedKey, setSelectedKey] = useState(keys[0]);
  const selected = list.find(indicator => indicator.key === selectedKey) ?? list[0];
  const series = useMemo(() => selected ? chartSeries(readings, [selected.key], years) : [], [readings, selected, years]);
  if (!list.length) return null;
  return <section className="mt-10" aria-label="Observations"><h3 className="text-xl">Inspect an observation</h3><p className="mt-2 text-xs text-[var(--ink-2)]">Select a measure to see its history, definition and source.</p><div className="mt-5 grid gap-5 lg:grid-cols-2"><div className="min-w-0 self-start border border-[var(--line)]">{list.map(indicator => <button type="button" key={indicator.key} onClick={() => setSelectedKey(indicator.key)} aria-pressed={selected?.key === indicator.key} className={`flex min-h-20 w-full items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-3 text-left last:border-0 ${selected?.key === indicator.key ? "bg-[var(--depth-3)]" : "hover:bg-[var(--depth-1)]"}`}><div className="min-w-0"><span className="block text-sm">{indicator.title}</span><span className="mt-1 block text-[11px] leading-5 text-[var(--ink-2)]">{indicator.latest?.period ?? "Awaiting observations"} · {indicator.freshness}{indicator.sourceHealth !== "healthy" ? ` · ${indicator.sourceHealth} source` : ""}</span></div><div className="shrink-0 text-right"><span className="block font-mono text-sm tabular-nums">{dividendNumber(indicator.latest?.value ?? null, indicator.unit)}</span><span className="mt-1 block text-[10px] text-[var(--ink-2)]">{indicator.unit === "usd2017" ? "2017 USD" : indicator.unit === "index" ? "source index" : "share / rate"}</span></div></button>)}</div>
    {selected && <article className="min-w-0 self-start border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--ink-2)]">{selected.source.toUpperCase()} · {selected.frequency}</p><h4 className="mt-3 text-xl">{selected.title}</h4><p className="mt-4 font-mono text-3xl tabular-nums">{dividendNumber(selected.latest?.value ?? null, selected.unit)}</p><p className="mb-6 mt-2 text-xs text-[var(--ink-2)]">{dividendChange(selected.annualChange, selected.change)} · {selected.latest?.period ?? "Unavailable"}</p><DividendChart series={series} unit={selected.unit === "percent" ? "%" : selected.unit === "usd2017" ? "2017 USD" : "source index"} /><SourceDetails indicator={selected} /></article>}
  </div></section>;
}

function YearsSelect({ years, onChange }: { years: number; onChange: (value: number) => void }) {
  return <label className="flex items-center gap-3 text-xs text-[var(--ink-2)]">History<select aria-label="History window" value={years} onChange={event => onChange(Number(event.target.value))} className="min-h-10 rounded-sm border border-[var(--line-2)] bg-[var(--depth-1)] px-3 text-[var(--ink)]"><option value={5}>5 years</option><option value={10}>10 years</option></select></label>;
}

export default function AIDividendView() {
  const { snapshot, loading, error, retry } = useDividendBaseline();
  const signals = useSignals();
  const [view, setView] = useState<View>("distribution");
  const [years, setYears] = useState(10);
  const [distribution, setDistribution] = useState<"income" | "wealth">("income");
  const readings = snapshot?.indicators ?? EMPTY_READINGS;
  const find = (key: string) => readings.find(indicator => indicator.key === key);
  const capacitySeries = useMemo(() => chartSeries(readings, ["productivity", "real_compensation"], years), [readings, years]);
  const distributionSeries = useMemo(() => chartSeries(readings, distribution === "income" ? ["income_bottom40", "income_middle40", "income_top20"] : ["wealth_top1", "wealth_bottom50"], years), [readings, years, distribution]);
  const stage = DIVIDEND_STAGES.find(item => item.id === view);
  const awaiting = <p className="py-10 text-sm text-[var(--ink-2)]" aria-busy={loading}>{loading ? "Loading official observations…" : "Official observations are unavailable right now."}</p>;

  return <main className="grain min-h-screen bg-[var(--depth-0)] text-[var(--ink)]">
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[rgba(6,7,7,.94)] backdrop-blur">
      <div className="flex h-14 items-center px-6 md:px-10"><div className="flex min-w-0 items-center gap-3 md:gap-4"><Link href="/#modules" className="sweep shrink-0 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]">← Index</Link><ModuleSwitcher current="dividend" /><span aria-hidden className="text-[var(--ink-3)]">/</span><p className="truncate font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">A3RO Intelligence — AI Dividend</p></div></div>
    </header>
    <div className="mx-auto max-w-7xl px-5 py-9 md:px-10 md:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4"><p className="font-mono text-[10px] uppercase tracking-[.26em] text-[var(--ink-2)]">Experiment · 2026–{DIVIDEND_OUTLOOK_END_YEAR}<DataAsOf module="dividend" /></p><span className="border border-[var(--line-2)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.15em]" style={{ color: DIVIDEND_ACCENT }}>Build {DIVIDEND_CURRENT_STEP} of 5 · Outlook to {DIVIDEND_OUTLOOK_END_YEAR} live</span></div>
      <h1 className="mt-5 text-4xl font-medium tracking-tight md:text-6xl">Where is the AI dividend going?</h1>
      <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--ink-2)]">AI capability is rising fast. This module tracks how much of it turns into real output, who captures the value, and what physical limits could stop it. Every figure comes from published data. Stages without data yet say so.</p>
      <ModuleIntro module="dividend" accent={DIVIDEND_ACCENT} />

      <nav aria-label="Measurement chain" className="mt-10"><ol className="grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3 lg:grid-cols-6">{DIVIDEND_STAGES.map((item, index) => <li key={item.id} className="bg-[var(--depth-0)]"><button type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)} className={`flex h-full min-h-24 w-full flex-col justify-between gap-3 p-4 text-left transition-colors ${view === item.id ? "bg-[var(--depth-3)]" : "hover:bg-[var(--depth-1)]"}`}><span className="font-mono text-[10px] text-[var(--ink-2)]">{String(index + 1).padStart(2, "0")}{index < DIVIDEND_STAGES.length - 1 ? " →" : ""}</span><span className="text-sm">{item.title}</span><StatusChip stage={item} /></button></li>)}</ol></nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div className="flex flex-wrap gap-2">{([{ key: "australia", label: "Australia" }, { key: "sources", label: "Sources & method" }] as const).map(item => <button type="button" key={item.key} aria-pressed={view === item.key} onClick={() => setView(item.key)} className={`min-h-10 rounded-sm px-3 text-xs transition-colors ${view === item.key ? "bg-[var(--depth-3)] text-[var(--ink)]" : "text-[var(--ink-2)] hover:text-[var(--ink)]"}`}>{item.label}</button>)}</div>
        <span className="font-mono text-[10px] text-[var(--ink-2)]" role="status">{loading ? "Checking official observations…" : snapshot ? `${snapshot.coverage.available}/${snapshot.coverage.total} baseline series available · ${snapshot.coverage.current} within freshness window` : "Baseline unavailable"}</span>
      </div>

      {error && <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-amber-300/30 p-4 text-sm text-amber-200" role="alert"><p>{error}{snapshot ? " The last loaded readings remain visible." : ""}</p><button type="button" onClick={retry} className="min-h-10 underline">Try again</button></div>}

      <div className="mt-10">
        {view === "australia" ? <AustraliaBaseline /> : view === "sources" ? <section>
          <h2 className="text-2xl">Sources and method</h2>
          <div className="mt-4 max-w-3xl space-y-3 text-sm leading-7 text-[var(--ink-2)]"><p>The module is built in five steps. Each stage of the chain shows only measured data; anything not yet measured is labelled with the step that will add it.</p><ol className="space-y-1">{Object.entries(DIVIDEND_BUILD_STEPS).map(([step, label]) => <li key={step} style={{ color: Number(step) <= DIVIDEND_CURRENT_STEP ? DIVIDEND_ACCENT : undefined }}>{step}. {label}{Number(step) <= DIVIDEND_CURRENT_STEP ? " · done" : ""}</li>)}</ol><p>The live baseline is US official statistics. Economy-wide productivity does not isolate AI’s contribution; income shares do not measure spending room; wealth groups differ from income groups. Each view keeps its own reference periods and units.</p></div>
          <div className="mt-7 grid gap-4 md:grid-cols-3">{snapshot?.sources.map(source => <article key={source.source} className="border border-[var(--line)] p-5"><h3 className="text-sm">{SOURCE_LABELS[source.source]}</h3><p className="mt-3 font-mono text-xs" style={{ color: source.health === "healthy" ? DIVIDEND_ACCENT : AMBER }}>{source.health}</p><p className="mt-3 text-xs leading-6 text-[var(--ink-2)]">Checked: {source.checkedAt ? source.checkedAt.slice(0, 16).replace("T", " ") + " UTC" : "Not yet checked"}</p>{source.error && <p className="mt-2 text-xs text-amber-200">{source.error}</p>}</article>)}</div>
          <div className="mt-7 max-w-3xl space-y-3 text-sm leading-7 text-[var(--ink-2)]"><p>Freshness is an estimated window from period end: monthly 75 days, quarterly 170 days and annual 660 days. Aging windows extend to 110, 230 and 790 days respectively. These are monitoring rules, not confirmed release calendars.</p><p>{snapshot?.archive === "available" ? "A revision archive is available. Source checks can include newer readings awaiting the next archival run." : "Revision archiving is unavailable for this view. The readings use current source histories, which can contain revisions."} Historical charts describe the currently retrieved history and should not be treated as information available on past dates.</p></div>
          <div className="mt-8 space-y-3">{readings.map(indicator => <article key={indicator.key} className="border border-[var(--line)] p-5"><h3 className="text-sm">{indicator.title}</h3><SourceDetails indicator={indicator} /></article>)}</div>
        </section> : stage && <section aria-label={stage.title}>
          <StageHeader stage={stage} />

          {stage.id === "distribution" && <>
            <ValueChainPanel />
            <h3 className="mt-12 text-xl">Workers & households</h3><p className="mt-2 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">The last layer of the chain: what reaches people as wages, jobs and income. US official statistics.</p>
            {!snapshot ? awaiting : <>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <Tile label="Real hourly compensation" value={formatChange(find("real_compensation"))} detail="Change over one year" meta={indicatorMeta(find("real_compensation"))} />
                <Tile label="Unemployment rate" value={dividendNumber(find("unemployment")?.latest?.value ?? null, "percent")} detail={dividendChange(find("unemployment")?.annualChange ?? null, "percentage_points")} meta={indicatorMeta(find("unemployment"))} />
                <Tile label="Bottom 40% income share" value={dividendNumber(find("income_bottom40")?.latest?.value ?? null, "percent")} detail="Share of disposable personal income" meta={indicatorMeta(find("income_bottom40"))} />
              </div>
              <article className="mt-5 min-w-0 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-base">Who receives household gains?</h4><p className="mt-2 text-xs text-[var(--ink-2)]">{distribution === "income" ? "Annual disposable income · income-ranked groups" : "Quarterly net worth · wealth-ranked groups"}</p></div><div className="flex flex-wrap items-center gap-3"><div className="flex gap-1">{(["income", "wealth"] as const).map(value => <button type="button" key={value} aria-pressed={distribution === value} onClick={() => setDistribution(value)} className={`min-h-10 px-3 text-xs capitalize ${distribution === value ? "bg-[var(--depth-3)]" : "text-[var(--ink-2)]"}`}>{value}</button>)}</div><YearsSelect years={years} onChange={setYears} /></div></div><DividendChart series={distributionSeries} unit="%" /><p className="mt-4 text-xs leading-6 text-[var(--ink-2)]">{distribution === "income" ? "Shares of aggregate disposable personal income. A change in share does not establish real income gains or losses within a group." : "Net worth includes illiquid assets and liabilities. The bottom 50% by wealth is a different population from the bottom 40% by income."}</p></article>
              <EntryLevelPanel state={signals} readings={readings} />
              <Inspector readings={readings} keys={stage.liveIndicatorKeys} years={years} />
            </>}
          </>}

          {stage.id === "capability" && <CapabilityPanel state={signals} />}

          {stage.id === "adoption" && <AdoptionPanel state={signals} />}

          {stage.id === "outlook" && <OutlookPanel readings={readings} signals={signals} />}

          {stage.id === "productivity" && (!snapshot ? awaiting : <>
            <ConversionPanel state={signals} productivity={find("productivity")} />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Tile label="Output per hour · economy-wide" value={formatChange(find("productivity"))} detail="Change over one year" meta={indicatorMeta(find("productivity"))} />
              <Tile label="Real hourly compensation" value={formatChange(find("real_compensation"))} detail="Change over one year" meta={indicatorMeta(find("real_compensation"))} />
            </div>
            <article className="mt-5 min-w-0 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base">Output and worker compensation</h3><p className="mt-2 text-xs text-[var(--ink-2)]">US nonfarm business sector · indexed to the first shared quarter</p></div><YearsSelect years={years} onChange={setYears} /></div><DividendChart series={capacitySeries} unit="index" indexed /><p className="mt-4 text-xs leading-6 text-[var(--ink-2)]">This is the whole-economy context, so it can’t separate AI from everything else. Industry-level productivity would get closer, but BLS publishes it only once a year for a limited set of industries; the job-postings split under “Who benefits” is the closer, faster signal for now.</p></article>
          </>)}

          {stage.id === "constraints" && <>
            <ConstraintsPanel />
            <h3 className="mt-12 text-xl">What households pay for power</h3>
            {!snapshot ? awaiting : <>
              <div className="mt-5 grid gap-4 md:grid-cols-2"><Tile label="Household electricity prices" value={formatChange(find("electricity_prices"))} detail="Change over one year · US CPI electricity component" meta={indicatorMeta(find("electricity_prices"))} /></div>
              <p className="mt-4 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">The household side of the power gauges: if data-centre demand pushes prices up, this is where people feel it.</p>
              <Inspector readings={readings} keys={stage.liveIndicatorKeys} years={years} />
            </>}
          </>}

          <StagePlan stage={stage} />
        </section>}
      <NewsletterSignup context="ai-dividend" title="The AI dividend, every week"
        blurb="How much of AI's capability is turning into real output, who is capturing the value, and what could stop it. One short email a week." />
      </div>
    </div>
    <SiteFooter />
  </main>;
}
