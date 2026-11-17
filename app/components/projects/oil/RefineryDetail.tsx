"use client";
import type { Refinery } from "./refineries";
import { refineryCondition, capacityLabel, mergeRefineryEvents } from "./refineries";
import type { FocusTarget } from "./types";
import type { CorridorMetricLatest } from "@a3ro/oil-backend";
import { currentMetrics } from "./dataQuality";
import CorridorSpark from "../CorridorSpark";
import RelationshipBlocks from "./explorer/RelationshipBlocks";
import { eventToTimeline, type Graph } from "./explorer/graph";
import type { RefineryFeed } from "./useRefineries";
import { Kicker, ProvenanceBadge, Section, SourceFooter, Timeline, type SourceCheck } from "../intel/primitives";
import { CORRIDOR_META } from "./types";

/** Automated checks that cover this refinery's evidence, combined into one line. */
function checkFor(r: Refinery, checks: RefineryFeed["checks"]): SourceCheck | null {
  const ids = new Set([...r.events.map(e => e.id ?? `${r.id}:${e.kind}:${e.date}`), ...(r.id === "bapco" ? ["bapco-updates"] : [])]);
  const mine = checks.filter(c => ids.has(c.source_id));
  if (!mine.length) return null;
  const successes = mine.map(c => c.last_success_at).filter((d): d is string => !!d).sort();
  return { ok: mine.every(c => c.status === "healthy"), lastAttempt: mine.map(c => c.last_attempted_at).sort().at(-1)!, lastSuccess: successes.at(-1) ?? null };
}

export default function RefineryDetail({ refinery: r, metrics, graph, checks, onFocus }: {
  refinery: Refinery; metrics: CorridorMetricLatest[] | null; graph: Graph; checks: RefineryFeed["checks"]; onFocus: (target: FocusTarget) => void;
}) {
  const regional = r.id === "galveston-bay" ? currentMetrics(metrics).find(m => m.corridor === "usgulf" && m.metric === "refinery_utilization") : undefined;
  const condition = refineryCondition(r);
  const events = mergeRefineryEvents(r);
  const operating = events.filter(e => !["project", "ownership"].includes(e.kind)).map(e => eventToTimeline(e, r.reviewedAt));
  const developments = events.filter(e => ["project", "ownership"].includes(e.kind)).map(e => eventToTimeline(e, r.reviewedAt));
  const corridor = r.corridorId ? CORRIDOR_META.find(c => c.id === r.corridorId) : null;
  const relationSources = graph.assetRelations.filter(a => a.assetId === r.id).map(a => ({ label: `${a.role === "owns" ? "Ownership" : "Operation"} · ${graph.companies.find(c => c.id === a.companyId)?.name ?? a.companyId}`, url: a.sourceUrl }));

  return <div className="space-y-5">
    <div>
      <Kicker>Refinery · {r.country}</Kicker>
      <h3 className="mt-2 text-xl leading-tight text-[var(--ink)]">{r.name}</h3>
      <p className="mt-1 text-xs text-[var(--ink-2)]">{r.operator}</p>
      <p className="mt-3 inline-flex items-center gap-2 border-l-2 pl-3 font-mono text-[11px] uppercase tracking-wide" style={{ borderColor: condition.color, color: condition.color }}>{condition.label}</p>
    </div>

    <dl className="grid grid-cols-2 gap-px bg-[var(--line)]">
      <div className="bg-[var(--depth-1)] p-3"><dt className="flex flex-wrap items-center justify-between gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">Capacity <ProvenanceBadge kind="reference" /></dt><dd className="mt-2 font-mono text-xl text-[var(--ink)]">{capacityLabel(r)}</dd></div>
      <div className="bg-[var(--depth-1)] p-3"><dt className="flex flex-wrap items-center justify-between gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">Throughput <ProvenanceBadge kind="unavailable" /></dt><dd className="mt-2 font-mono text-xl text-[var(--ink-3)]">—</dd></div>
    </dl>
    <p className="-mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">{r.capacityBasis}. Current throughput and available capacity are not observed for this site.</p>
    <p className="text-xs leading-relaxed text-[var(--ink-2)]">{r.context}</p>

    <RelationshipBlocks graph={graph} assetId={r.id} onFocus={onFocus} />

    <Section title="Developments" aside={<span className="font-mono text-[11px] text-[var(--ink-3)]">{developments.length} dated</span>}>
      <Timeline items={developments} empty="No dated project or ownership developments recorded in this coverage." />
    </Section>

    <Section title="Operating history" aside={<span className="font-mono text-[11px] text-[var(--ink-3)]">{operating.length} sourced</span>}>
      <Timeline items={operating} empty="No verified facility outage or restart records in this coverage. This does not establish normal operation." />
    </Section>

    {r.units?.length ? <Section title="Processing-unit references">
      <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">Published capacities overlap across processing stages. They cannot be added to estimate available or unavailable capacity.</p>
      <ul className="mt-3 divide-y divide-[var(--line)]">{r.units.map(unit => <li key={unit.name} className="py-2"><p className="flex justify-between gap-3 text-xs text-[var(--ink-2)]"><a href={unit.sourceUrl} target="_blank" rel="noreferrer" className="text-[var(--asset-accent)] underline">{unit.name} ↗</a><span className="whitespace-nowrap font-mono">{unit.capacityKbd} kb/d</span></p><p className="mt-1 text-[11px] text-[var(--ink-3)]">{unit.basis}</p></li>)}</ul>
    </Section> : null}

    {regional && <Section title="Regional context"><p className="text-xs text-[var(--ink-2)]">PADD 3 utilization · {regional.value.toFixed(1)}% · week ending {regional.periodDate}</p><CorridorSpark key={r.id} corridor="usgulf" metric="refinery_utilization" caption="US Gulf region · not facility throughput" /></Section>}

    {corridor && <button type="button" onClick={() => onFocus({ kind: "corridor", id: corridor.id })} className="w-full border border-[var(--line)] px-3 py-2 text-left text-xs text-[var(--asset-accent)] hover:bg-white/[0.04]">Corridor exposure · {corridor.title} →</button>}

    <SourceFooter
      sources={[{ label: "Capacity / site reference", url: r.sourceUrl }, ...relationSources, ...events.map(e => ({ label: `${e.title}`, url: e.sourceUrl }))]}
      reviewed={[
        { label: "Capacity & site", date: r.reviewedAt },
        { label: "Relationships", date: graph.assetRelations.filter(a => a.assetId === r.id).map(a => a.reviewedAt).sort().at(-1) ?? null },
      ]}
      check={checkFor(r, checks)}
      note="Capacity figures are published references; facility trends require operating observations. Coordinates mark the site or complex, not unit footprints."
    />
  </div>;
}
