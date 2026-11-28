"use client";

import { useMemo, useState } from "react";
import DividendChart from "./DividendChart";
import { DIVIDEND_ACCENT } from "./dividendData";
import { useConstraints } from "./ConstraintsPanel";
import type { useSignals } from "./SignalsPanels";
import { useValueChain } from "./valueChainData";
import { OUTLOOK_END, SCENARIOS, buildOutlook, project, type OutlookInputs, type PredictionRead, type ScenarioId } from "../../../../backend/src/dividend/outlook/outlook";
import type { DividendRead } from "../../../../backend/src/dividend/types";

const COLORS: Record<ScenarioId, string> = { dividend: "#5fc9a4", bubble: "#e07a5f", upstream: "#d4a157" };
const TITLES = Object.fromEntries(SCENARIOS.map(item => [item.id, item.title])) as Record<ScenarioId, string>;
const pct = (value: number, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;

function useOutlookInputs(readings: DividendRead[], signals: ReturnType<typeof useSignals>): OutlookInputs | null {
  const valueChain = useValueChain();
  const constraints = useConstraints();
  return useMemo(() => {
    const series = (key: string) => readings.find(item => item.key === key)?.points.map(({ period, value }) => ({ period, value })) ?? [];
    const productivity = series("productivity");
    if (!productivity.length) return null;
    const capability = signals.data?.capability, adoption = signals.data?.adoption, postings = signals.data?.postings;
    const financing = constraints.data?.gauges.find(gauge => gauge.id === "financing");
    const labs = valueChain.data?.labs.filter(lab => lab.operatingIncome !== null) ?? [];
    return {
      productivity, realCompensation: series("real_compensation"),
      unemployment20to24: series("unemployment_20_24"), unemployment25to54: series("unemployment_25_54"),
      capability: capability ? { frontier: capability.frontier, gainLast12Months: capability.gainLast12Months } : null,
      adoption: adoption ? { monthly: adoption.monthly.map(point => ({ period: point.period, use: point.use })), changeSixMonths: adoption.changeSixMonths } : null,
      postings: postings ? { exposed: postings.exposed, handsOn: postings.handsOn, gap: postings.gap, gapAtLaunch: postings.gapAtLaunch } : null,
      infrastructure: valueChain.data?.layers.find(layer => layer.layer === "infrastructure") ?? null,
      labsOperatingIncome: labs.length ? labs.reduce((total, lab) => total + lab.operatingIncome!, 0) : null,
      financing: financing?.value != null && financing.asOf ? { ratio: financing.value, asOf: financing.asOf } : null,
    };
  }, [readings, signals.data, valueChain.data, constraints.data]);
}

function Chip({ id }: { id: ScenarioId }) {
  return <span className="mr-1.5 inline-block border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[.08em]" style={{ color: COLORS[id], borderColor: COLORS[id] }}>{TITLES[id]}</span>;
}

function predictionValue(item: PredictionRead) {
  if (!item.reading) return "—";
  const value = item.unit === "%" ? `${item.reading.value.toFixed(1)}%` : item.unit === "×" ? `${Math.round(item.reading.value * 100)}%` : item.reading.value.toFixed(item.metric === "conversion_gap" ? 2 : 1);
  return `${value} (${item.reading.asOf})`;
}

function predictionLine(item: PredictionRead) {
  const threshold = item.unit === "×" ? `${Math.round(item.threshold * 100)}%` : `${item.threshold}${item.unit === "%" ? "%" : ""}`;
  return `${item.comparator === ">=" ? "≥" : "≤"} ${threshold}`;
}

export default function OutlookPanel({ readings, signals }: { readings: DividendRead[]; signals: ReturnType<typeof useSignals> }) {
  const inputs = useOutlookInputs(readings, signals);
  const outlook = useMemo(() => inputs ? buildOutlook(inputs) : null, [inputs]);
  const [choice, setChoice] = useState<ScenarioId | "custom">("upstream");
  const [excess, setExcess] = useState(0.8);
  const [share, setShare] = useState(0.5);
  const active = choice === "custom" ? null : SCENARIOS.find(item => item.id === choice)!;
  const projection = useMemo(() => inputs ? project(inputs.productivity, inputs.realCompensation, active?.excessProductivity ?? excess, active?.passThrough ?? share) : null, [inputs, active, excess, share]);

  if (!outlook) return <div className="mt-8 border border-[var(--line)] p-6 text-sm text-[var(--ink-2)]">The outlook needs the baseline productivity data, which hasn’t loaded yet.</div>;
  const { lean, signposts, predictions } = outlook;
  const chartFrom = "2019-Q4";

  return <div className="mt-8">
    {/* 1. Which way the evidence leans */}
    <article className="border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6">
      <p className="text-xs text-[var(--ink-2)]">The evidence so far leans toward</p>
      <p className="mt-3 text-2xl md:text-3xl" style={{ color: lean.leader ? COLORS[lean.leader] : "var(--ink)" }}>{lean.leader ? TITLES[lean.leader] : "No clear lean yet"}</p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">{SCENARIOS.map(item => <span key={item.id}><span className="font-mono text-lg tabular-nums" style={{ color: COLORS[item.id] }}>{lean.counts[item.id]}</span> <span className="text-[var(--ink-2)]">signposts for {item.title.toLowerCase()}</span></span>)}</div>
      <p className="mt-4 text-xs leading-6 text-[var(--ink-2)]">A count of {lean.available} live signposts, each with a written rule below, not a probability. One signpost can support two scenarios, and the scenarios can overlap: gains can pool upstream while the build-out is also over-stretched.</p>
    </article>

    <div className="mt-5 overflow-x-auto border border-[var(--line)]"><table className="w-full min-w-[680px] text-left"><caption className="sr-only">Signposts</caption><thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-[.1em] text-[var(--ink-2)]"><tr><th className="px-4 py-3 font-normal">Signpost</th><th className="px-4 py-3 font-normal">Reading now</th><th className="px-4 py-3 font-normal">Supports</th></tr></thead><tbody>
      {signposts.map(item => <tr key={item.id} className="border-b border-[var(--line)] align-top last:border-0"><td className="px-4 py-3"><span className="text-sm">{item.title}</span><details className="mt-1 text-[11px] leading-5 text-[var(--ink-2)]"><summary className="cursor-pointer">Rule</summary><p className="mt-1">{item.rule}</p></details></td><td className="px-4 py-3 text-xs leading-5 text-[var(--ink)]">{item.reading}</td><td className="px-4 py-3">{item.supports.length ? item.supports.map(id => <Chip key={id} id={id} />) : <span className="text-[11px] text-[var(--ink-2)]">{item.available ? "Neither way" : "—"}</span>}</td></tr>)}
    </tbody></table></div>

    {/* 2. Scenarios */}
    <h3 className="mt-12 text-xl">Three ways to {OUTLOOK_END.year}</h3>
    <p className="mt-2 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">Each scenario sets two numbers: how far productivity runs above its pre-pandemic trend, and how much of that growth reaches real hourly pay. Everything else follows from today’s readings. These are conditional (“if this, then that”), not forecasts.</p>
    <div className="mt-5 grid gap-4 lg:grid-cols-3">{SCENARIOS.map(item => {
      const selected = choice === item.id;
      return <button type="button" key={item.id} aria-pressed={selected} onClick={() => setChoice(item.id)} className={`flex flex-col border p-5 text-left transition-colors ${selected ? "bg-[var(--depth-3)]" : "bg-[var(--depth-1)] hover:bg-[var(--depth-2,var(--depth-1))]"}`} style={{ borderColor: selected ? COLORS[item.id] : "var(--line)" }}>
        <span className="flex items-center justify-between gap-3"><span className="text-base" style={{ color: COLORS[item.id] }}>{item.title}</span>{lean.leader === item.id && <span className="font-mono text-[9px] uppercase tracking-[.12em] text-[var(--ink-2)]">Evidence leans here</span>}</span>
        <span className="mt-3 text-xs leading-6 text-[var(--ink)]">{item.story}</span>
        <span className="mt-4 font-mono text-[11px] text-[var(--ink-2)]">Productivity {item.excessProductivity >= 0 ? "+" : ""}{item.excessProductivity.toFixed(1)} pts over trend · {Math.round(item.passThrough * 100)}% reaches pay</span>
        <span className="mt-3 space-y-1 text-[11px] leading-5 text-[var(--ink-2)]">{Object.values(item.expect).map(line => <span key={line} className="block">— {line}</span>)}</span>
      </button>;
    })}</div>

    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border border-[var(--line)] p-4 text-xs text-[var(--ink-2)]">
      <button type="button" aria-pressed={choice === "custom"} onClick={() => setChoice("custom")} className={`min-h-10 px-3 ${choice === "custom" ? "bg-[var(--depth-3)] text-[var(--ink)]" : ""}`}>Try your own</button>
      <label className="flex items-center gap-3">Productivity over trend <input type="range" min={-0.5} max={2} step={0.1} value={active?.excessProductivity ?? excess} onChange={event => { setChoice("custom"); setExcess(Number(event.target.value)); }} className="w-32" aria-label="Productivity growth above trend, points a year" /><span className="w-16 font-mono text-[var(--ink)]">{(active?.excessProductivity ?? excess) >= 0 ? "+" : ""}{(active?.excessProductivity ?? excess).toFixed(1)} pts</span></label>
      <label className="flex items-center gap-3">Share reaching pay <input type="range" min={0.2} max={1} step={0.05} value={active?.passThrough ?? share} onChange={event => { setChoice("custom"); setShare(Number(event.target.value)); }} className="w-32" aria-label="Share of productivity growth reaching real pay" /><span className="w-12 font-mono text-[var(--ink)]">{Math.round((active?.passThrough ?? share) * 100)}%</span></label>
    </div>

    {projection && <>
      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {[
          { label: `Output per hour by ${OUTLOOK_END.year}`, value: pct(projection.productivityChange), note: `${projection.productivityGrowth.toFixed(2)}% a year from ${projection.from}` },
          { label: `Real hourly pay by ${OUTLOOK_END.year}`, value: pct(projection.payChange), note: `${projection.payGrowth.toFixed(2)}% a year` },
          { label: "Extra output from AI", value: pct(projection.extraOutputVsTrend), note: `vs the old ${projection.trend.toFixed(2)}%-a-year trend` },
          { label: "Output growth not reaching pay", value: `${(projection.productivityChange - projection.payChange).toFixed(1)} pts`, note: "goes to profits, capital and prices instead" },
        ].map(tile => <article key={tile.label} className="border border-[var(--line)] bg-[var(--depth-1)] p-5"><p className="text-xs text-[var(--ink-2)]">{tile.label}</p><p className="mt-3 font-mono text-2xl tabular-nums" style={{ color: active ? COLORS[active.id] : DIVIDEND_ACCENT }}>{tile.value}</p><p className="mt-2 text-[11px] leading-5 text-[var(--ink-2)]">{tile.note}</p></article>)}
      </div>
      <article className="mt-5 min-w-0 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><h4 className="text-base">{active ? active.title : "Your scenario"}: output and pay</h4><p className="mb-5 mt-2 text-xs text-[var(--ink-2)]">US nonfarm business · history to {projection.from}, scenario after · {chartFrom} = 100</p><DividendChart series={[{ key: "productivity", label: "Output per hour", color: DIVIDEND_ACCENT, points: projection.productivity.filter(point => point.period >= chartFrom).map(point => ({ ...point, status: null })) }, { key: "pay", label: "Real hourly pay", color: "#d4a157", points: projection.pay.filter(point => point.period >= chartFrom).map(point => ({ ...point, status: null })) }]} unit="index" indexed projection /></article>
    </>}

    {/* 3. Prediction ledger */}
    <h3 className="mt-12 text-xl">Prediction ledger</h3>
    <p className="mt-2 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">Dated calls that live data will settle. Each is scored on the first reading at or after its date. They are stored in the code, so the commit history shows when each was made; new calls get a new date and old ones are never edited. Until a call settles, “will it still be true” calls compare the latest reading with the line; calls on a rising measure (business AI use, frontier capability) carry the last 12 months’ pace forward to the settle date.</p>
    <div className="mt-5 overflow-x-auto border border-[var(--line)]"><table className="w-full min-w-[760px] text-left text-xs"><caption className="sr-only">Prediction ledger</caption><thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-[.1em] text-[var(--ink-2)]"><tr><th className="px-4 py-3 font-normal">Call</th><th className="px-4 py-3 font-normal">Made</th><th className="px-4 py-3 font-normal">Settles</th><th className="px-4 py-3 font-normal">Line</th><th className="px-4 py-3 font-normal">Latest reading</th><th className="px-4 py-3 font-normal">Status</th></tr></thead><tbody>
      {predictions.map(item => {
        const status = item.status === "hit" ? { text: "Right", color: "#5fc9a4" } : item.status === "miss" ? { text: "Wrong", color: "#e07a5f" } : { text: item.onTrack === null ? (item.reading ? "Pending · too little history to judge pace" : "Waiting for data") : item.projected !== null ? `Pending · ${item.onTrack ? "on pace" : "behind pace"} (≈${item.unit === "%" ? `${item.projected.toFixed(1)}%` : item.projected.toFixed(0)} by ${item.resolvesAt})` : item.onTrack ? "Pending · past the line now" : "Pending · short of the line now", color: "var(--ink-2)" };
        return <tr key={item.id} className="border-b border-[var(--line)] align-top last:border-0"><td className="px-4 py-3"><span className="text-sm leading-6">{item.call}</span><span className="mt-1 block"><Chip id={item.scenario} /></span></td><td className="px-4 py-3 whitespace-nowrap font-mono">{item.madeOn}</td><td className="px-4 py-3 whitespace-nowrap font-mono">{item.resolvesAt}</td><td className="px-4 py-3 whitespace-nowrap font-mono">{predictionLine(item)}</td><td className="px-4 py-3 whitespace-nowrap font-mono">{predictionValue(item)}</td><td className="px-4 py-3" style={{ color: status.color }}>{status.text}</td></tr>;
      })}
    </tbody></table></div>
    <p className="mt-4 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">“Short of the line now” is not a miss: some calls expect growth before they settle. The chip shows which scenario a call would support if it comes true.</p>
  </div>;
}
