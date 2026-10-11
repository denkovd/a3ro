"use client";
import { useState } from "react";
import type { CorridorMetricLatest } from "@a3ro/oil-backend";
import CorridorSpark from "../CorridorSpark";
import { crackSpread, metricFreshness } from "./dataQuality";

const MEASURES = [
  { metric: "refinery_utilization", title: "US Gulf refinery utilization", geography: "PADD 3" },
  { metric: "us_refinery_utilization", title: "US refinery utilization", geography: "United States" },
  { metric: "distillate_stocks", title: "Distillate stocks", geography: "United States" },
  { metric: "gasoline_stocks", title: "Gasoline stocks", geography: "United States" },
  { metric: "us_crude_stocks", title: "Commercial crude · ex-SPR", geography: "United States" },
  { metric: "crude_exports", title: "Crude exports", geography: "United States" },
] as const;

export default function PhysicalOverview({ metrics, failed }: { metrics: CorridorMetricLatest[] | null; failed: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const crack = crackSpread(metrics);
  const rows = (metrics ?? []).filter(m => m.corridor === "usgulf" && MEASURES.some(def => def.metric === m.metric));
  const allStale = rows.length > 0 && rows.every(m => metricFreshness(m) === "stale");
  const latestDate = rows.map(m => m.periodDate).sort().at(-1);
  const observations = <div className="mt-3 divide-y divide-[var(--line)]">
      {MEASURES.map(def => {
        const row = metrics?.find(m => m.corridor === "usgulf" && m.metric === def.metric);
        const stale = row ? metricFreshness(row) === "stale" : false;
        const open = expanded === def.metric;
        return <div key={def.metric} className="py-3">
          <button type="button" disabled={!row} aria-expanded={open} onClick={() => setExpanded(open ? null : def.metric)} className="w-full text-left enabled:hover:bg-white/[0.03] disabled:cursor-default">
            <span className="flex items-start justify-between gap-3"><span className="text-[11px] text-[var(--ink-2)]">{def.title}</span><span className={`whitespace-nowrap font-mono text-xs ${stale ? "text-[var(--ink-3)]" : "text-[var(--ink)]"}`}>{row ? `${row.value.toFixed(1)} ${row.unit}` : "—"}</span></span>
            <span className="mt-1 block font-mono text-[8px] uppercase tracking-wide text-[var(--ink-3)]">{def.geography} · {row ? `Weekly · ${row.periodDate} · ${stale ? "STALE" : "Reported"}` : "No observation"}</span>
          </button>
          {open && row && <div className="pt-2"><p className="text-[10px] text-[var(--ink-3)]">{row.source} · source timestamp {row.observedAt.slice(0, 10)}</p><CorridorSpark key={def.metric} corridor={row.corridor} metric={row.metric} caption={`${def.geography} · ${row.unit} · reported history`} /></div>}
        </div>;
      })}
    </div>;
  return <section aria-label="Refining and inventory observations">
    <h3 className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">Refining & inventory</h3>
    <p className="mt-2 text-xs leading-relaxed text-[var(--ink-2)]">Processing capacity, fuel buffers and export access. Select an observation to inspect its trend.</p>
    {failed && <p role="status" className="mt-3 text-[10px] text-[#d4a157]">Physical feed refresh failed · retained observations are dated below.</p>}
    {metrics === null && <p className="mt-3 text-xs text-[var(--ink-3)]">{failed ? "Physical observations unavailable." : "Loading physical observations…"}</p>}
    {allStale ? <div className="mt-3 border-l-2 border-[#d4a157]/50 pl-3"><p className="text-xs text-[var(--ink-2)]">No current physical observations</p><p className="mt-1 text-[10px] text-[var(--ink-3)]">Latest week ending {latestDate}. Current conditions cannot be inferred.</p><details className="mt-3"><summary className="cursor-pointer text-[10px] text-[#d4a157]">Inspect historical observations</summary>{observations}</details></div> : observations}
    {crack && <div className="mt-1 border-l border-[#d4a157]/40 pl-3"><p className="text-[11px] text-[var(--ink-2)]">Spot 3:2:1 margin proxy · <span className="font-mono text-[var(--ink)]">${crack.value.toFixed(2)}/bbl</span></p><p className="mt-1 text-[9px] leading-relaxed text-[var(--ink-3)]">NY Harbor products / Cushing crude · {crack.periodDate} · {crack.source}. Price proxy, not a facility profit margin.</p></div>}
  </section>;
}
