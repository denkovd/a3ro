"use client";
import type { Refinery } from "./refineries";
import { refineryStatus, capacityLabel, mergeRefineryEvents } from "./refineries";
import type { FocusTarget } from "./types";
import type { CorridorMetricLatest } from "@a3ro/oil-backend";
import { currentMetrics } from "./dataQuality";
import CorridorSpark from "../CorridorSpark";

export default function RefineryDetail({ refinery: r, metrics, onFocus }: { refinery: Refinery; metrics: CorridorMetricLatest[] | null; onFocus: (target: FocusTarget) => void }) {
  const regional = r.id === "galveston-bay" ? currentMetrics(metrics).find(m => m.corridor === "usgulf" && m.metric === "refinery_utilization") : undefined;
  return <div className="space-y-5">
    <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Refinery · {r.country}</p><h3 className="mt-2 text-xl text-[var(--ink)]">{r.name}</h3><p className="mt-1 text-xs text-[var(--ink-2)]">{r.operator}</p></div>
    <p className="border-l-2 border-[#d4a157] pl-3 font-mono text-[10px] uppercase tracking-wide text-[var(--ink-2)]">{refineryStatus(r)}</p>
    <div><p className="font-mono text-3xl text-[var(--ink)]">{capacityLabel(r)}</p><p className="mt-2 text-xs leading-relaxed text-[var(--ink-3)]">{r.capacityBasis}</p><p className="mt-2 text-xs text-[var(--ink-3)]">Current throughput and available capacity: unavailable.</p></div>
    <p className="text-xs leading-relaxed text-[var(--ink-2)]">{r.context}</p>
    <section className="border-t border-[var(--line)] pt-4"><h4 className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Operating history</h4>
      {r.events.length ? mergeRefineryEvents(r).map(e => <article key={e.id ?? `${e.date}-${e.kind}`} className="mt-3 border-l border-[var(--line)] pl-3"><p className="font-mono text-[9px] text-[#d4a157]">{e.date} · {e.kind} · {e.scope ?? "facility"}</p><p className="mt-1 text-sm text-[var(--ink)]">{e.title}</p><p className="mt-1 text-xs leading-relaxed text-[var(--ink-2)]">{e.detail}</p>
        {e.affectedUnits?.length ? <p className="mt-2 text-[10px] text-[var(--ink-2)]">Units: {e.affectedUnits.join(", ")}</p> : null}
        {e.affectedProducts?.length ? <p className="mt-2 text-[10px] text-[var(--ink-2)]">Products: {e.affectedProducts.join(", ")}</p> : null}
        <p className="mt-2 text-[10px] text-[var(--ink-3)]">Affected capacity: {e.affectedCapacityKbd == null ? "unquantified" : `${e.affectedCapacityKbd} kb/d`} · restart: {e.expectedRestart ?? "unconfirmed"}</p>
        <p className="mt-2 text-[9px] text-[var(--ink-3)]">Evidence: {e.confidence ?? "operator"} · verified {(e.verifiedAt ?? r.reviewedAt).slice(0,10)} · {e.publishedAt ? `published ${e.publishedAt.slice(0,10)}` : "publication date unavailable"}</p>
        <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-[#d4a157] underline">Source report ↗</a></article>) : <p className="mt-3 text-xs leading-relaxed text-[var(--ink-3)]">No verified facility outage or restart records in this coverage. This does not establish normal operation.</p>}
    </section>
    {regional && <section><p className="text-xs text-[var(--ink-2)]">PADD 3 utilization · {regional.value.toFixed(1)}% · week ending {regional.periodDate}</p><CorridorSpark key={r.id} corridor="usgulf" metric="refinery_utilization" caption="US Gulf region · not facility throughput" /></section>}
    {r.corridorId && <button type="button" onClick={() => onFocus({ kind: "corridor", id: r.corridorId! })} className="border border-[var(--line)] px-3 py-2 text-xs text-[#d4a157] hover:bg-white/5">Explore connected corridor →</button>}
    <footer className="border-t border-[var(--line)] pt-3 text-[10px] leading-relaxed text-[var(--ink-3)]"><a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-[#d4a157] underline">Capacity / site source ↗</a><p className="mt-2">Reference reviewed {r.reviewedAt}. Capacity figures are published references; facility trends require operating observations.</p></footer>
  </div>;
}
