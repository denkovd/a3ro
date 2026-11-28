"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { historicalContext } from "../../../backend/src/australia/watch";
import type { AustraliaIndicator } from "../../../backend/src/australia/types";
import { AUSTRALIA_REGISTRY, indicatorsInSection, isAustraliaIndicator, primaryByPillar, type AustraliaIndicatorDef } from "../../../backend/src/australia/registry";
import { AU_ACCENT, delta, displayValue, estimatedFreshness, fetchOverdue, releaseDateLabel, useAustraliaWatch, type AustraliaObservation, type AustraliaReleaseSchedule, type FetchState } from "../../components/projects/australia/australiaWatchData";
import ReleaseSchedule from "../../components/projects/australia/ReleaseSchedule";
import PulseBand from "../../components/projects/australia/PulseBand";
import { computePulse, pulseHistory, type MeasuredLead } from "../../../backend/src/australia/pulse";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import SiteFooter from "../../components/SiteFooter";
import NewsletterSignup from "../../components/NewsletterSignup";
import { DataAsOf } from "../../components/DataAsOf";
import ModuleIntro, { SectionHint } from "../../components/ModuleIntro";
const SOURCE_NAME = { rba_csv: "RBA", oecd_sdmx: "OECD", abs_sdmx: "ABS", apra_xlsx: "APRA", aemo_csv: "AEMO", asic_xlsx: "ASIC" } as const;

const label = (indicator: string) => isAustraliaIndicator(indicator) ? AUSTRALIA_REGISTRY[indicator].label : indicator;
const PILLARS = primaryByPillar();
const COMPARISON = indicatorsInSection("comparison");
const RBA_SOURCE = "https://www.rba.gov.au/education/resources/explainers/australias-inflation-target.html";

function IndicatorChart({rows,fetchState,schedule,lead}:{rows:AustraliaObservation[];fetchState?:FetchState;schedule?:AustraliaReleaseSchedule;lead?:MeasuredLead|null}) {
  const [selected,setSelected] = useState<string|null>(null);
  const current = [...rows].sort((a,b)=>a.referencePeriod.localeCompare(b.referencePeriod)).at(-1);
  const context = historicalContext(rows.map(r=>({...r,indicator:r.indicator as AustraliaIndicator})));
  if(!current || !context) return <p className="text-[var(--ink-3)]">Observation unavailable</p>;
  const {points,baseline,mean,sd,z,direction,unit,minimum,baselineYears} = context;
  const def: AustraliaIndicatorDef | undefined = isAustraliaIndicator(current.indicator) ? AUSTRALIA_REGISTRY[current.indicator] : undefined;
  const band = def?.targetBand;
  const target = !!band;
  const numbers = points.map(p=>p.value);
  if(mean !== null && sd !== null) numbers.push(mean-sd,mean+sd);
  if(band) numbers.push(band[0],band[1]);
  const lo = Math.min(...numbers); const hi = Math.max(...numbers);
  const pad = Math.max((hi-lo)*.12,.2);
  const min=lo-pad,max=hi+pad;
  const x=(i:number)=>48+i/Math.max(1,points.length-1)*472;
  const y=(v:number)=>200-(v-min)/(max-min)*170;
  const highlighted = points.find(p=>p.period===selected) ?? points.at(-1);
  const freshness = estimatedFreshness(current, new Date(), schedule);
  const overdue = fetchOverdue(fetchState?.retrievedAt ?? current.lastVerifiedAt);
  const behindRelease = !!schedule?.latestReferencePeriod && current.referencePeriod < schedule.latestReferencePeriod;
  const alert = behindRelease || freshness==="stale" || fetchState?.health==="degraded" || overdue;
  const line = points.map((p,i)=>`${i?"L":"M"}${x(i)},${y(p.value)}`).join(" ");
  const signed=(n:number)=>`${n>=0?"+":""}${n.toFixed(1)}`;
  const spreadUnit = unit.startsWith("%") ? " pp" : unit;
  const sourceName = def ? SOURCE_NAME[def.source] : "ABS";
  const typical = def?.typicalLeadMonths;
  const measured = lead ?? null;
  return <article id={`au-${current.indicator}`} className="scroll-mt-20 rounded-md border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-medium text-[var(--ink)]">{label(current.indicator)}</h2><p className="mt-1 text-xs text-[var(--ink-3)]">{def?.subtitle ?? (current.frequency === "quarterly" ? "Quarterly observation" : "Monthly observation")}</p>{def && <p className="mt-1 font-mono text-[9px] uppercase tracking-[.15em] text-[var(--ink-3)]">{def.role}{measured ? ` · measured lead ${measured.lagMonths} months vs unemployment (r ${measured.r.toFixed(2)}, ${measured.from}–${measured.to})` : typical ? ` · typical lead ${typical[0]}–${typical[1]} months, not measured` : ""}</p>}</div><span className="rounded border border-[var(--line)] px-2 py-1 text-xs" style={{color:AU_ACCENT}}>{direction}</span></div>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><p className="text-4xl font-semibold tracking-tight text-[var(--ink)]">{displayValue(current)}</p><p className="text-xs text-[var(--ink-2)]">{delta(current,rows)}</p></div>
    <p className="mt-2 text-xs text-[var(--ink-3)]">Reference period: {current.referencePeriod} · Last verified: {releaseDateLabel(current.lastVerifiedAt)}</p>
    {alert && <p className="mt-3 text-xs text-amber-300">Data warning: {behindRelease ? `${sourceName} has published ${schedule!.latestReferencePeriod}; awaiting ingestion` : fetchState?.health==="degraded" ? "latest source fetch failed; showing stored observations" : overdue ? "source checks are overdue; showing last verified figures" : "latest observation is estimated stale"}.</p>}
    <ReleaseSchedule schedule={schedule} quarterly={current.frequency === "quarterly"}/>
    <div className="mt-5 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3 text-xs"><div><p className="text-[var(--ink-3)]">Historical context</p><p className="mt-1 text-[var(--ink)]">{z===null ? (baseline.length < minimum ? `Norm withheld — ${baseline.length} of ${minimum} prior observations` : "Insufficient comparable history") : `${signed(z)} standard deviations from average`}</p></div><div><p className="text-[var(--ink-3)]">Average · variability</p><p className="mt-1 text-[var(--ink)]">{mean===null||sd===null ? "Unavailable" : `${mean.toFixed(1)}${unit} · ±${sd.toFixed(1)}${spreadUnit}`}</p></div></div>
    {points.length>1 ? <svg className="mt-4 w-full" viewBox="0 0 550 238" role="img" aria-label={`${label(current.indicator)} history in ${unit}, with historical average and one standard deviation band`}>
      {mean!==null && sd!==null && <><rect x="48" y={y(mean+sd)} width="472" height={y(mean-sd)-y(mean+sd)} fill="#8b9dff" opacity=".10"/><line x1="48" x2="520" y1={y(mean)} y2={y(mean)} stroke="#8b9dff" strokeDasharray="4 4"/></>}
      {band && <><rect x="48" y={y(band[1])} width="472" height={y(band[0])-y(band[1])} fill="#5fc9a4" opacity=".17"/><line x1="48" x2="520" y1={y((band[0]+band[1])/2)} y2={y((band[0]+band[1])/2)} stroke="#5fc9a4" strokeDasharray="3 5"/><text x="515" y={y(band[1])-5} textAnchor="end" fill="#5fc9a4" fontSize="9">RBA 2–3% reference</text></>}
      {[0,1,2,3].map(i=>{const v=min+(max-min)*i/3;return <g key={i}><line x1="48" x2="520" y1={y(v)} y2={y(v)} stroke="var(--line)"/><text x="39" y={y(v)+3} textAnchor="end" fill="var(--ink-3)" fontSize="9">{v.toFixed(1)}{unit.startsWith("%") ? "%" : unit}</text></g>})}
      <path d={line} fill="none" stroke={AU_ACCENT} strokeWidth="2"/>
      {points.map((p,i)=><circle key={p.period} cx={x(i)} cy={y(p.value)} r={selected===p.period?4:2} fill={AU_ACCENT} tabIndex={0} aria-label={`${p.period}: ${p.value.toFixed(2)}${unit}`} onMouseEnter={()=>setSelected(p.period)} onFocus={()=>setSelected(p.period)} onClick={()=>setSelected(p.period)}><title>{p.period}: {p.value.toFixed(2)}{unit}</title></circle>)}
      <text x="48" y="222" fill="var(--ink-3)" fontSize="9">{points[0]?.period}</text><text x="520" y="222" textAnchor="end" fill="var(--ink-3)" fontSize="9">{points.at(-1)?.period}</text>
    </svg>:<p className="mt-5 text-xs text-[var(--ink-3)]">History accumulating — a chart needs two comparable observations.</p>}
    <p className="text-xs text-[var(--ink-2)]">{highlighted ? `${highlighted.period} · ${highlighted.value.toFixed(2)}${unit}` : "Annual growth unavailable"}</p>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">{baseline.length ? `Baseline: ${baseline[0].period}–${baseline.at(-1)?.period} · ${baseline.length} prior observations, up to ${baselineYears} years${mean===null ? `; a norm needs at least ${minimum}` : ""}. ${mean===null ? "" : "Blue band: average ±1 sample standard deviation; descriptive, not a forecast or target."}` : "Baseline unavailable."}{def?.transform==="yoy_from_level" && " Annual growth compares the same month a year earlier."}{def?.note && ` ${def.note}`}</p>
    {target && <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]"><a className="underline" href={RBA_SOURCE} target="_blank" rel="noreferrer">RBA target reference: 2–3%, midpoint 2.5%</a>. {current.frequency==="monthly" ? "Since November 2025 the target is year-ended headline inflation from the complete Monthly CPI (original series). The RBA assesses it over time, so one month outside the band is context, not a compliance test." : "The policy target is now headline inflation from the Monthly CPI; this quarterly seasonally adjusted series is kept for comparison, so the band is context only."}</p>}
    <details className="mt-4 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--ink-3)]"><summary className="cursor-pointer">{sourceName} · {current.referencePeriod} · {schedule?.latestReferencePeriod ? "release-based" : "estimated"} freshness: {freshness}</summary><p className="mt-2">{current.adjustment} · Publication date: {current.publicationDate??(schedule?.latest?.referencePeriod === current.referencePeriod ? releaseDateLabel(schedule.latest.releaseAt) : "Unknown")} · Source fetch: {fetchState?.health??"never_attempted"}</p><a className="mt-2 inline-block underline" href={current.sourceUrl} target="_blank" rel="noreferrer">Official {sourceName} {def?.source === "rba_csv" ? "table" : "series"}</a><p className="mt-2">{schedule?.latestReferencePeriod ? `Freshness compares against the latest published ${sourceName} period. Calendar checked: ${releaseDateLabel(schedule.verifiedAt)}.` : def?.releaseFamily === "rba" ? `The RBA publishes release rules rather than dated calendars, so freshness assumes publication about ${def.releaseLagDays} days after month end.` : def?.releaseFamily === "oecd" ? `The OECD does not publish a machine-readable release calendar, so freshness assumes publication about ${def.releaseLagDays} days after month end.` : def?.releaseFamily === "apra" ? `APRA publishes these statistics about ${def.releaseLagDays} days after each quarter ends; freshness assumes that.` : def?.releaseFamily === "asic" ? "ASIC re-issues these statistics about every two weeks; the latest month is provisional." : def?.releaseFamily === "aemo" ? "AEMO publishes prices every five minutes; this card is the monthly average, and the current month shows month to date." : `Release calendar unavailable. Freshness falls back to an estimated ${def?.releaseLagDays ?? (current.frequency==="monthly"?21:45)}-day publication lag.`} Source checks run daily; this page refreshes every minute while visible.</p></details>
    <details className="mt-3 text-[11px] text-[var(--ink-3)]"><summary className="cursor-pointer">Observation values and sources ({rows.length})</summary><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left"><thead><tr><th>Period</th><th>Value</th><th>Publication</th><th>Retrieved</th><th>Source</th></tr></thead><tbody>{[...rows].reverse().map(o=><tr key={o.referencePeriod} className="border-t border-[var(--line)]"><td className="py-2">{o.referencePeriod}</td><td>{displayValue(o)}</td><td>{o.publicationDate??"Unknown"}</td><td>{new Date(o.lastVerifiedAt).toLocaleDateString()}</td><td><a href={o.sourceUrl.split(" ")[0]} target="_blank" rel="noreferrer">{sourceName} ↗</a></td></tr>)}</tbody></table></div></details>
  </article>;
}

function IndicatorSlot({indicator,data,lead}:{indicator:AustraliaIndicator;data:ReturnType<typeof useAustraliaWatch>;lead?:MeasuredLead|null}) {
  const rows=data.observations.filter(o=>o.indicator===indicator);
  return rows.length?<IndicatorChart rows={rows} fetchState={data.fetchStates[indicator]} schedule={data.releaseSchedules[indicator]} lead={lead}/>:<article className="border border-[var(--line)] p-6"><h2 className="text-lg text-[var(--ink)]">{label(indicator)}</h2><p className="mt-4 text-[var(--ink-3)]">Unavailable — awaiting valid {SOURCE_NAME[AUSTRALIA_REGISTRY[indicator].source]} observations.</p><ReleaseSchedule schedule={data.releaseSchedules[indicator]} quarterly={AUSTRALIA_REGISTRY[indicator].frequency==="quarterly"}/></article>;
}

export default function AustraliaWatchView() {
  const router=useRouter(); const data=useAustraliaWatch();
  // Recomputed only when observations or release schedules change; pure and deterministic (backend/src/australia/pulse.ts).
  const trail=useMemo(()=>data.status==="ready"?pulseHistory(data.observations,5):[],[data.status,data.observations]);
  const pulse=useMemo(()=>data.status==="ready"?computePulse(data.observations,{schedules:data.releaseSchedules}):null,[data.status,data.observations,data.releaseSchedules]);
  const leave=useCallback(()=>router.push("/#modules"),[router]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>e.key==="Escape"&&leave();addEventListener("keydown",onKey);return()=>removeEventListener("keydown",onKey)},[leave]);
  return <main className="grain fixed inset-0 overflow-y-auto bg-[var(--depth-0)]">
    {data.testMode && <div className="bg-amber-200 px-6 py-2 text-center text-sm text-black">LOCAL TEST DATABASE — official ABS, RBA and OECD history fetched for this preview. Production is unchanged.</div>}
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,.9)] px-6 backdrop-blur md:px-10"><div className="flex min-w-0 items-center gap-3 md:gap-4"><button onClick={leave} className="sweep shrink-0 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]" aria-label="Close Australia Watch and return to the index">← Index</button><ModuleSwitcher current="australia"/><span aria-hidden className="text-[var(--ink-3)]">/</span><p className="truncate font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">A3RO Intelligence — Australia Watch<DataAsOf module="australia" className="hidden sm:inline" /></p></div></header>
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10"><p className="font-mono text-[10px] uppercase tracking-[.3em] text-[var(--ink-3)]">Australian economic conditions</p><h1 className="mt-3 text-4xl font-semibold text-[var(--ink)]">Australia Watch</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--ink-2)]">Inflation, labour, financial, housing, demand and external conditions from the ABS, RBA and OECD, each measured against its own history. Inflation uses the complete Monthly CPI, Australia’s primary measure since November 2025. Each card is tagged leading, coincident or lagging. Direction describes the latest comparable change; distance from average puts it in context. <a href="/methodology/australia-watch" className="underline">How this works</a></p>
    <ModuleIntro module="australia" accent={AU_ACCENT} />
    {data.refreshError && data.status === "ready" && <p role="status" className="mt-5 text-xs text-amber-300">Refresh failed — showing the last loaded observations. Retrying automatically.</p>}
    {data.status!=="ready"?<p className="mt-16 text-[var(--ink-3)]">{data.status==="error"?"Data unavailable":"Loading official observations…"}</p>:<>
      {pulse && <PulseBand pulse={pulse} trail={trail}/>}
      {PILLARS.map(group=><section key={group.pillar} aria-label={group.label} className="mt-10 first:mt-8"><p className="font-mono text-[10px] uppercase tracking-[.3em]" style={{color:AU_ACCENT}}>{group.label}</p><SectionHint module="australia" section={group.pillar} /><div className="mt-4 grid gap-5 lg:grid-cols-2">{group.indicators.map(indicator=><IndicatorSlot key={indicator} indicator={indicator} data={data} lead={pulse?.leads[indicator]}/>)}</div></section>)}
      {COMPARISON.length>0 && <section aria-label="Quarterly CPI comparison" className="mt-14 border-t border-[var(--line)] pt-8"><p className="font-mono text-[10px] uppercase tracking-[.3em] text-[var(--ink-3)]">Comparison series</p><h2 className="mt-2 text-xl font-medium text-[var(--ink)]">Quarterly CPI</h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">Kept for continuity with the long quarterly history. The Monthly CPI above is Australia’s primary inflation measure and the RBA’s target measure.</p><div className="mt-6 grid gap-5 lg:grid-cols-2">{COMPARISON.map(indicator=><IndicatorSlot key={indicator} indicator={indicator} data={data}/>)}</div></section>}
    </>}
    <NewsletterSignup context="australia-watch" title="Australia Watch, every week"
      blurb="A short weekly read on where the Australian economy sits: the Pulse, what moved, and what's due next. Built on ABS, RBA and OECD data." />
    </div>
    <SiteFooter />
  </main>;
}
