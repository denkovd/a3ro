"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMarketSnapshot } from "../marketFetch";
import DividendChart from "./DividendChart";
import { DIVIDEND_ACCENT } from "./dividendData";
import { AI_ERA_START, EXPOSURE_GROUPS, conversionGap, type SignalsSnapshot } from "../../../../backend/src/dividend/signals/snapshot";
import type { DividendRead } from "../../../../backend/src/dividend/types";

const AMBER = "#d4a157";
const GREEN = "#5fc9a4";
const SOURCE_LABEL = { epoch: "Epoch AI", btos: "US Census Bureau", indeed: "Indeed Hiring Lab" } as const;

export function useSignals() {
  const [data, setData] = useState<SignalsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMarketSnapshot("/api/dividend/signals").then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json();
      if (payload?.version !== 1 || !Array.isArray(payload.sources)) throw new Error("unverified");
      if (active) { setData(payload); setError(null); }
    }).catch(() => { if (active) setError("These figures could not be loaded. Try again shortly."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { data, loading, error, retry };
}

const signed = (value: number | null | undefined, digits = 1, suffix = "") => value == null || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}${suffix}`;
const monthLabel = (period: string | null | undefined) => period ? new Date(`${period.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const dayLabel = (date: string | null | undefined) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

function Card({ label, value, detail, note, tone }: { label: string; value: string; detail: string; note?: string; tone?: string }) {
  return <article className="border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><p className="text-xs text-[var(--ink-2)]">{label}</p><p className="mt-4 font-mono text-3xl tabular-nums tracking-tight" style={{ color: tone }}>{value}</p><p className="mt-3 text-xs leading-6 text-[var(--ink)]">{detail}</p>{note && <p className="mt-1 text-[11px] leading-5 text-[var(--ink-2)]">{note}</p>}</article>;
}

function Waiting({ state, source }: { state: ReturnType<typeof useSignals>; source: keyof typeof SOURCE_LABEL }) {
  const health = state.data?.sources.find(item => item.source === source);
  return <div className="mt-8 border border-[var(--line)] p-6 text-sm leading-6 text-[var(--ink-2)]" aria-busy={state.loading}>{state.loading ? "Loading…" : state.error ? <span>{state.error} <button type="button" onClick={state.retry} className="underline">Try again</button></span> : `${SOURCE_LABEL[source]} data hasn’t been loaded yet. It refreshes daily${health?.checkedAt ? `; last check ${health.checkedAt.slice(0, 10)}${health.error ? " failed" : ""}` : ""}.`}</div>;
}

function SourceLine({ children, url, retrievedAt, label }: { children: React.ReactNode; url: string; retrievedAt: string; label: string }) {
  return <p className="mt-5 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">{children} Source: <a href={url} target="_blank" rel="noreferrer" className="underline">{label} ↗</a> · checked {retrievedAt.slice(0, 10)}.</p>;
}

export function CapabilityPanel({ state }: { state: ReturnType<typeof useSignals> }) {
  const capability = state.data?.capability;
  if (!capability) return <Waiting state={state} source="epoch" />;
  return <div className="mt-8">
    <div className="grid gap-4 md:grid-cols-3">
      <Card label="Frontier capability" value={capability.leader.score.toFixed(1)} detail={`${capability.leader.name} (${capability.leader.organization}), released ${dayLabel(capability.leader.date)}`} note="Epoch Capabilities Index. Anchors: Claude 3.5 Sonnet = 130, GPT-5 = 150." />
      <Card label="Gained in the last 12 months" value={signed(capability.gainLast12Months, 1, " pts")} detail={`${signed(capability.gainSinceStart.value, 1, " pts")} since ${monthLabel(capability.gainSinceStart.from)}, the first month scored`} tone={GREEN} />
      <Card label="Best open-weights model trails by" value={capability.openGap == null ? "—" : `${capability.openGap.toFixed(1)} pts`} detail={capability.openLeader ? `${capability.openLeader.name} scores ${capability.openLeader.score.toFixed(1)}` : "No open-weights model scored"} note="A small gap means frontier capability is cheap to copy, which pushes value away from the labs." />
    </div>
    <article className="mt-5 min-w-0 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><h4 className="text-base">The capability frontier</h4><p className="mb-5 mt-2 text-xs text-[var(--ink-2)]">Best score released by each month</p><DividendChart series={[{ key: "frontier", label: "Best model", color: DIVIDEND_ACCENT, points: capability.frontier.map(point => ({ ...point, status: null })) }, { key: "open", label: "Best open-weights model", color: GREEN, points: capability.openFrontier.map(point => ({ ...point, status: null })) }]} unit="ECI" /></article>
    <SourceLine url="https://epoch.ai/benchmarks" retrievedAt={capability.retrievedAt} label="Epoch AI Capabilities Index">The index combines dozens of benchmarks into one score per model, and Epoch refits it as new results arrive, so past scores can shift slightly. {capability.models} models scored. A point gain is a step up in measured ability, not a percentage.</SourceLine>
  </div>;
}

export function AdoptionPanel({ state }: { state: ReturnType<typeof useSignals> }) {
  const adoption = state.data?.adoption;
  if (!adoption) return <Waiting state={state} source="btos" />;
  const monthly = adoption.monthly.filter(point => point.use !== null && point.expected !== null);
  return <div className="mt-8">
    <div className="grid gap-4 md:grid-cols-3">
      <Card label="US businesses using AI" value={`${adoption.latest.use!.toFixed(1)}%`} detail={`in the two weeks to ${dayLabel(adoption.latest.period)}`} note="Share of employer businesses, survey-weighted." />
      <Card label="Change over six months" value={signed(adoption.changeSixMonths, 1, " pts")} detail={adoption.sixMonthsBefore ? `from ${adoption.sixMonthsBefore.use!.toFixed(1)}% in the two weeks to ${dayLabel(adoption.sixMonthsBefore.period)}` : `Six months of data not yet available (series starts ${dayLabel(adoption.first.period)})`} tone={GREEN} />
      <Card label="Expect to use AI within six months" value={adoption.latest.expected == null ? "—" : `${adoption.latest.expected.toFixed(1)}%`} detail="of businesses, same survey" note="The gap to current use shows how much adoption is still intended rather than done." />
    </div>
    {monthly.length >= 2 && <article className="mt-5 min-w-0 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><h4 className="text-base">Business AI use</h4><p className="mb-5 mt-2 text-xs text-[var(--ink-2)]">Last fortnightly estimate in each month</p><DividendChart series={[{ key: "use", label: "Using AI now", color: DIVIDEND_ACCENT, points: monthly.map(point => ({ period: point.period, value: point.use!, status: null })) }, { key: "expected", label: "Expect to within six months", color: GREEN, points: monthly.map(point => ({ period: point.period, value: point.expected!, status: null })) }]} unit="%" /></article>}
    <SourceLine url="https://www.census.gov/hfp/btos/data_downloads" retrievedAt={adoption.retrievedAt} label="Census Business Trends and Outlook Survey">Question asked: “{adoption.question}” Census broadened the question in November 2025; earlier figures (around 10% in late 2025) used a narrower question and aren’t comparable, so the series starts there. Using AI is not the same as getting value from it.</SourceLine>
  </div>;
}

export function ConversionPanel({ state, productivity }: { state: ReturnType<typeof useSignals>; productivity: DividendRead | undefined }) {
  const gap = useMemo(() => productivity ? conversionGap(productivity.points) : null, [productivity]);
  const capability = state.data?.capability;
  if (!gap) return null;
  return <div className="mt-8">
    <div className="grid gap-4 md:grid-cols-3">
      <Card label="Conversion gap" value={signed(gap.gap, 2, " pp")} detail={`Productivity has grown ${gap.annualSince.toFixed(2)}% a year since ChatGPT launched, against ${gap.annualTrend.toFixed(2)}% a year before the pandemic`} tone={gap.gap > 0 ? GREEN : AMBER} note={`${gap.from} to ${gap.to} vs ${gap.trendFrom} to ${gap.trendTo}, annualised.`} />
      <Card label="Meanwhile, capability" value={capability ? signed(capability.gainSinceStart.value, 1, " pts") : "—"} detail={capability ? `on the Epoch index since ${monthLabel(capability.gainSinceStart.from)}` : "Capability data not loaded yet"} />
      <Card label="Reading it" value={gap.gap > 0.5 ? "Faster" : gap.gap < -0.5 ? "Slower" : "About the same"} detail={gap.gap > 0.5 ? "Productivity is running ahead of its old trend: consistent with AI starting to pay off." : gap.gap < -0.5 ? "Productivity is behind its old trend: capability isn’t showing up in output yet." : "No clear break from the old trend yet."} note="Other things changed too (interest rates, the post-pandemic labour market, investment), so this is a signal to watch, not proof AI caused it." />
    </div>
  </div>;
}

export function EntryLevelPanel({ state, readings }: { state: ReturnType<typeof useSignals>; readings: DividendRead[] }) {
  const postings = state.data?.postings;
  const [showAll, setShowAll] = useState(false);
  const young = readings.find(item => item.key === "unemployment_20_24");
  const prime = readings.find(item => item.key === "unemployment_25_54");
  const youngSeries = [young, prime].every(item => item && item.points.length) ? [
    { key: "young", label: "Ages 20–24", color: AMBER, points: young!.points.filter(point => point.period >= "2019-01") },
    { key: "prime", label: "Ages 25–54", color: DIVIDEND_ACCENT, points: prime!.points.filter(point => point.period >= "2019-01") },
  ] : null;
  const youngGap = young?.latest && prime?.latest && young.latest.period === prime.latest.period ? young.latest.value - prime.latest.value : null;
  const youngGapAtLaunch = (() => {
    const a = young?.points.find(point => point.period === AI_ERA_START.month)?.value, b = prime?.points.find(point => point.period === AI_ERA_START.month)?.value;
    return a != null && b != null ? a - b : null;
  })();
  return <section className="mt-12" aria-label="Entry-level jobs">
    <h3 className="text-xl">Entry-level jobs</h3>
    <p className="mt-2 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">If AI is replacing work, it should show first in hiring for computer-based roles and in young people’s job prospects.</p>
    {!postings ? <Waiting state={state} source="indeed" /> : <>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Card label="AI-exposed job postings" value={postings.exposed.at(-1)!.value.toFixed(0)} detail={`vs ${postings.handsOn.at(-1)!.value.toFixed(0)} for hands-on jobs (1 Feb 2020 = 100)`} tone={AMBER} note={`Indeed, ${monthLabel(postings.latestMonth)} average to ${dayLabel(postings.latestDay)}.`} />
        <Card label="Gap, exposed minus hands-on" value={signed(postings.gap, 0, " pts")} detail={postings.gapAtLaunch != null ? `${signed(postings.gapAtLaunch, 0, " pts")} when ChatGPT launched (Nov 2022)` : "No comparison for Nov 2022"} tone={postings.gap < (postings.gapAtLaunch ?? 0) ? AMBER : GREEN} />
        <Card label="Unemployment gap, 20–24 vs 25–54" value={signed(youngGap, 1, " pts")} detail={youngGapAtLaunch != null ? `${signed(youngGapAtLaunch, 1, " pts")} in Nov 2022` : "Comparison unavailable"} note={young?.latest ? `BLS, ${monthLabel(young.latest.period)}. Young people are always more likely to be unemployed; watch the change.` : undefined} />
      </div>
      <article className="mt-5 min-w-0 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><h4 className="text-base">Job postings by exposure to AI</h4><p className="mb-5 mt-2 text-xs text-[var(--ink-2)]">Monthly average of Indeed’s postings index · 1 Feb 2020 = 100 · average of each group’s occupations</p><DividendChart series={[{ key: "exposed", label: "AI-exposed (computer-based work)", color: AMBER, points: postings.exposed.map(point => ({ ...point, status: null })) }, { key: "handsOn", label: "Hands-on work", color: GREEN, points: postings.handsOn.map(point => ({ ...point, status: null })) }]} unit="index" /></article>
      {youngSeries && <article className="mt-5 min-w-0 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><h4 className="text-base">Unemployment by age</h4><p className="mb-5 mt-2 text-xs text-[var(--ink-2)]">US, seasonally adjusted · from 2019</p><DividendChart series={youngSeries} unit="%" /></article>}
      <details className="mt-5 border border-[var(--line)]" open={showAll} onToggle={event => setShowAll((event.target as HTMLDetailsElement).open)}><summary className="cursor-pointer px-4 py-3 text-sm">All {postings.sectors.length} occupations · postings now vs Nov 2022</summary><div className="overflow-x-auto border-t border-[var(--line)]"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-[10px] uppercase tracking-[.1em] text-[var(--ink-2)]"><tr><th className="px-4 py-2 font-normal">Occupation</th><th className="px-4 py-2 font-normal">Group</th><th className="px-4 py-2 text-right font-normal">Nov 2022</th><th className="px-4 py-2 text-right font-normal">Now</th></tr></thead><tbody>{postings.sectors.map(item => <tr key={item.sector} className="border-t border-[var(--line)]"><td className="px-4 py-2">{item.sector}</td><td className="px-4 py-2" style={{ color: item.group === "exposed" ? AMBER : item.group === "handsOn" ? GREEN : "var(--ink-2)" }}>{item.group === "exposed" ? "AI-exposed" : item.group === "handsOn" ? "Hands-on" : "Not grouped"}</td><td className="px-4 py-2 text-right font-mono tabular-nums">{item.atLaunch?.toFixed(0) ?? "—"}</td><td className="px-4 py-2 text-right font-mono tabular-nums">{item.latest?.toFixed(0) ?? "—"}</td></tr>)}</tbody></table></div></details>
      <SourceLine url="https://github.com/hiring-lab/job_postings_tracker" retrievedAt={postings.retrievedAt} label="Indeed Hiring Lab">Groups are ours: AI-exposed means mostly computer-based work with text, code or data ({EXPOSURE_GROUPS.exposed.length} occupations), the tasks research rates most exposed to language models; hands-on means physical or in-person work ({EXPOSURE_GROUPS.handsOn.length}). Tech hiring also boomed in 2021–22 and fell as interest rates rose, so part of the gap predates AI. This is a signal, not proof of cause.</SourceLine>
    </>}
  </section>;
}
