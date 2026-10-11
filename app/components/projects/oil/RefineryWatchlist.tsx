"use client";
import { useState } from "react";
import { refineryCondition, capacityLabel, type Refinery } from "./refineries";
import type { RefineryFeed } from "./useRefineries";
import type { FocusTarget } from "./types";

function isRecent(date: string) {
  const age = Date.now() - Date.parse(date);
  return age >= 0 && age < 30 * 86_400_000;
}

export default function RefineryWatchlist({ refineries, feed, onFocus }: { refineries: Refinery[]; feed: RefineryFeed; onFocus: (target: FocusTarget) => void }) {
  const [filter, setFilter] = useState("all");
  const list = refineries.filter(r => {
    const status = refineryCondition(r).status;
    if (filter === "closures") return status === "closed" || status === "idled";
    if (filter === "outages") return status === "outage" || status === "maintenance";
    if (filter === "recent") return r.events.some(e => isRecent(e.publishedAt ?? e.date));
    return true;
  });
  const recent = refineries.flatMap(r => r.events.map(e => ({ r,e }))).filter(({ e }) => isRecent(e.publishedAt ?? e.date)).sort((a,b) => b.e.date.localeCompare(a.e.date)).slice(0,3);
  return <section aria-label="Refinery coverage">
    <div className="flex items-center justify-between gap-2"><h3 className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">Refineries · {refineries.length} sites</h3><label className="sr-only" htmlFor="refinery-filter">Filter refinery coverage</label><select id="refinery-filter" value={filter} onChange={e => setFilter(e.target.value)} className="border border-[var(--line)] bg-[var(--depth-1)] p-1 text-[10px] text-[var(--ink-2)]"><option value="all">All sites</option><option value="outages">Current outages</option><option value="closures">Closed / idled</option><option value="recent">Recent reports</option></select></div>
    <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-3)]">Source-backed events. Coverage is partial; missing reports do not establish normal operation.</p>
    {feed.status === "error" && <p className="mt-2 text-[10px] text-[#d4a157]">Evidence feed unavailable · showing reviewed references.</p>}
    {feed.checks.some(c => c.status === "error") && <p className="mt-2 text-[10px] text-[#d4a157]">Some official sources could not be refreshed. Event dates remain visible.</p>}
    {recent.length > 0 && <div className="mt-3 border-l border-[#d4a157]/40 pl-3"><h4 className="font-mono text-[8px] uppercase tracking-wide text-[var(--ink-3)]">Recent sourced updates</h4>{recent.map(({r,e}) => <button key={e.id ?? e.sourceUrl} type="button" onClick={() => onFocus({ kind: "refinery", id: r.id })} className="mt-2 w-full text-left"><span className="text-[11px] text-[var(--ink-2)]">{e.title}</span><span className="mt-1 block text-[9px] text-[var(--ink-3)]">{r.name} · {e.date} · {e.scope ?? "facility"}</span></button>)}</div>}
    <ul className="mt-2 divide-y divide-[var(--line)]">{list.map(r => {
      const condition = refineryCondition(r);
      return <li key={r.id}><button type="button" onClick={() => onFocus({ kind: "refinery", id: r.id })} className="w-full py-3 text-left hover:bg-white/[0.03]"><span className="flex justify-between gap-3"><span className="text-[11px] text-[var(--ink-2)]">{r.name}</span><span className="font-mono text-[10px] text-[var(--ink)]">{capacityLabel(r)}</span></span><span className="mt-1 block text-[9px]" style={{ color: condition.color }}>{r.country} · {condition.label}</span></button></li>;
    })}</ul>
    {list.length === 0 && <p className="mt-3 text-xs text-[var(--ink-3)]">No verified events match this filter in the current coverage.</p>}
  </section>;
}
