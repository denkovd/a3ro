"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { historicalContext } from "../../../backend/src/australia/watch";
import type { AustraliaIndicator } from "../../../backend/src/australia/types";
import { AU_ACCENT, delta, displayValue, estimatedFreshness, useAustraliaWatch, type AustraliaObservation, type FetchState } from "../../components/projects/australia/australiaWatchData";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";

const LABEL: Record<string,string> = { trimmed_mean_cpi_yoy:"Trimmed-mean inflation",headline_cpi_yoy:"Headline inflation",unemployment_rate:"Unemployment rate",hours_worked:"Hours worked" };
const ORDER = Object.keys(LABEL);
const RBA_SOURCE = "https://www.rba.gov.au/education/resources/explainers/australias-inflation-target.html";

function IndicatorChart({rows,fetchState}:{rows:AustraliaObservation[];fetchState?:FetchState}) {
  const [selected,setSelected] = useState<string|null>(null);
  const current = [...rows].sort((a,b)=>a.referencePeriod.localeCompare(b.referencePeriod)).at(-1);
  const context = historicalContext(rows.map(r=>({...r,indicator:r.indicator as AustraliaIndicator})));
  if(!current || !context) return <p className="text-[var(--ink-3)]">Observation unavailable</p>;
  const {points,baseline,mean,sd,z,direction,unit} = context;
  const target = current.indicator === "headline_cpi_yoy";
  const numbers = points.map(p=>p.value);
  if(mean !== null && sd !== null) numbers.push(mean-sd,mean+sd);
  if(target) numbers.push(2,3);
  const lo = Math.min(...numbers); const hi = Math.max(...numbers);
  const pad = Math.max((hi-lo)*.12,.2);
  const min=lo-pad,max=hi+pad;
  const x=(i:number)=>48+i/Math.max(1,points.length-1)*472;
  const y=(v:number)=>200-(v-min)/(max-min)*170;
  const highlighted = points.find(p=>p.period===selected) ?? points.at(-1);
  const alert = estimatedFreshness(current)==="stale" || fetchState?.health==="degraded";
  const line = points.map((p,i)=>`${i?"L":"M"}${x(i)},${y(p.value)}`).join(" ");
  const signed=(n:number)=>`${n>=0?"+":""}${n.toFixed(1)}`;
  return <article className="rounded-md border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-medium text-[var(--ink)]">{LABEL[current.indicator]}</h2><p className="mt-1 text-xs text-[var(--ink-3)]">{current.frequency === "quarterly" ? "Quarterly observation · annual inflation" : current.indicator==="hours_worked" ? "Monthly total · chart shows annual growth" : "Monthly · seasonally adjusted"}</p></div><span className="rounded border border-[var(--line)] px-2 py-1 text-xs" style={{color:AU_ACCENT}}>{direction}</span></div>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><p className="text-4xl font-semibold tracking-tight text-[var(--ink)]">{displayValue(current)}</p><p className="text-xs text-[var(--ink-2)]">{delta(current,rows)}</p></div>
    {alert && <p className="mt-3 text-xs text-amber-300">Data warning: {estimatedFreshness(current)==="stale"?"latest observation is estimated stale":"latest source fetch failed; showing stored observations"}.</p>}
    <div className="mt-5 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3 text-xs"><div><p className="text-[var(--ink-3)]">Historical context</p><p className="mt-1 text-[var(--ink)]">{z===null ? "Insufficient comparable history" : `${signed(z)} standard deviations from average`}</p></div><div><p className="text-[var(--ink-3)]">Average · variability</p><p className="mt-1 text-[var(--ink)]">{mean===null||sd===null ? "Unavailable" : `${mean.toFixed(1)}${unit} · ±${sd.toFixed(1)} pp`}</p></div></div>
    {points.length>1 ? <svg className="mt-4 w-full" viewBox="0 0 550 238" role="img" aria-label={`${LABEL[current.indicator]} history in ${unit}, with historical average and one standard deviation band`}>
      {mean!==null && sd!==null && <><rect x="48" y={y(mean+sd)} width="472" height={y(mean-sd)-y(mean+sd)} fill="#8b9dff" opacity=".10"/><line x1="48" x2="520" y1={y(mean)} y2={y(mean)} stroke="#8b9dff" strokeDasharray="4 4"/></>}
      {target && <><rect x="48" y={y(3)} width="472" height={y(2)-y(3)} fill="#5fc9a4" opacity=".17"/><line x1="48" x2="520" y1={y(2.5)} y2={y(2.5)} stroke="#5fc9a4" strokeDasharray="3 5"/><text x="515" y={y(3)-5} textAnchor="end" fill="#5fc9a4" fontSize="9">RBA 2–3% reference</text></>}
      {[0,1,2,3].map(i=>{const v=min+(max-min)*i/3;return <g key={i}><line x1="48" x2="520" y1={y(v)} y2={y(v)} stroke="var(--line)"/><text x="39" y={y(v)+3} textAnchor="end" fill="var(--ink-3)" fontSize="9">{v.toFixed(1)}%</text></g>})}
      <path d={line} fill="none" stroke={AU_ACCENT} strokeWidth="2"/>
      {points.map((p,i)=><circle key={p.period} cx={x(i)} cy={y(p.value)} r={selected===p.period?4:2} fill={AU_ACCENT} tabIndex={0} aria-label={`${p.period}: ${p.value.toFixed(2)}${unit}`} onMouseEnter={()=>setSelected(p.period)} onFocus={()=>setSelected(p.period)} onClick={()=>setSelected(p.period)}><title>{p.period}: {p.value.toFixed(2)}{unit}</title></circle>)}
      <text x="48" y="222" fill="var(--ink-3)" fontSize="9">{points[0]?.period}</text><text x="520" y="222" textAnchor="end" fill="var(--ink-3)" fontSize="9">{points.at(-1)?.period}</text>
    </svg>:<p className="mt-5 text-xs text-[var(--ink-3)]">History accumulating — a chart needs two comparable observations.</p>}
    <p className="text-xs text-[var(--ink-2)]">{highlighted ? `${highlighted.period} · ${highlighted.value.toFixed(2)}${unit}` : "Annual growth unavailable"}</p>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">{baseline.length ? `Baseline: ${baseline[0].period}–${baseline.at(-1)?.period} · ${baseline.length} prior observations, up to 10 years. Blue band: average ±1 sample standard deviation; descriptive, not a forecast or target.` : "Baseline unavailable."}{current.indicator==="hours_worked" && " Annual growth compares the same month a year earlier."}</p>
    {target && <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]"><a className="underline" href={RBA_SOURCE} target="_blank" rel="noreferrer">RBA target reference: 2–3%, midpoint 2.5%</a>. The policy target is headline CPI; this chart retains our quarterly seasonally adjusted series, so the band is context rather than an exact target-compliance test.</p>}
    <details className="mt-4 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--ink-3)]"><summary className="cursor-pointer">ABS · {current.referencePeriod} · estimated freshness: {estimatedFreshness(current)}</summary><p className="mt-2">{current.adjustment} · Publication date: {current.publicationDate??"Unknown"} · Retrieved: {new Date(current.lastVerifiedAt).toLocaleString()} · Source fetch: {fetchState?.health??"never_attempted"}</p><a className="mt-2 inline-block underline" href={current.sourceUrl} target="_blank" rel="noreferrer">Official ABS series</a><p className="mt-2">Freshness uses estimated 21-day monthly / 45-day quarterly lags, not confirmed release dates.</p></details>
    <details className="mt-3 text-[11px] text-[var(--ink-3)]"><summary className="cursor-pointer">Observation values and sources ({rows.length})</summary><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left"><thead><tr><th>Period</th><th>Value</th><th>Publication</th><th>Retrieved</th><th>Source</th></tr></thead><tbody>{[...rows].reverse().map(o=><tr key={o.referencePeriod} className="border-t border-[var(--line)]"><td className="py-2">{o.referencePeriod}</td><td>{displayValue(o)}</td><td>{o.publicationDate??"Unknown"}</td><td>{new Date(o.lastVerifiedAt).toLocaleDateString()}</td><td><a href={o.sourceUrl} target="_blank" rel="noreferrer">ABS ↗</a></td></tr>)}</tbody></table></div></details>
  </article>;
}

export default function AustraliaWatchView() {
  const router=useRouter(); const data=useAustraliaWatch();
  const leave=useCallback(()=>router.push("/#modules"),[router]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>e.key==="Escape"&&leave();addEventListener("keydown",onKey);return()=>removeEventListener("keydown",onKey)},[leave]);
  return <main className="grain fixed inset-0 overflow-y-auto bg-[var(--depth-0)]">
    {data.testMode && <div className="bg-amber-200 px-6 py-2 text-center text-sm text-black">LOCAL TEST DATABASE — official ABS history fetched for this preview. Production is unchanged.</div>}
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,.9)] px-6 backdrop-blur"><div className="flex items-center gap-4"><button onClick={leave} className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--ink-2)]">← Index</button><span className="text-[var(--ink-3)]">/</span><span className="font-mono text-[10px] uppercase text-[var(--ink-3)]">Australia Watch</span><ModuleSwitcher current="australia"/></div></header>
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10"><p className="font-mono text-[10px] uppercase tracking-[.3em] text-[var(--ink-3)]">Australian economic conditions</p><h1 className="mt-3 text-4xl font-semibold text-[var(--ink)]">Australia Watch</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--ink-2)]">Inflation and labour trends, measured against their own history. Direction describes the latest comparable change; distance from average puts it in context.</p>
    {data.status!=="ready"?<p className="mt-16 text-[var(--ink-3)]">{data.status==="error"?"Data unavailable":"Loading official observations…"}</p>:<div className="mt-8 grid gap-5 lg:grid-cols-2">{ORDER.map(indicator=>{const rows=data.observations.filter(o=>o.indicator===indicator);return rows.length?<IndicatorChart key={indicator} rows={rows} fetchState={data.fetchStates[indicator]}/>:<article key={indicator} className="border border-[var(--line)] p-6"><h2 className="text-lg text-[var(--ink)]">{LABEL[indicator]}</h2><p className="mt-4 text-[var(--ink-3)]">Unavailable — awaiting valid ABS observations.</p></article>})}</div>}
    </div>
  </main>;
}
