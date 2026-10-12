"use client";
import { useState } from "react";
import type { CorridorMetricLatest } from "@a3ro/oil-backend";
import CorridorSpark from "../CorridorSpark";
import PhysicalOverview from "./PhysicalOverview";
import { metricFreshness } from "./dataQuality";
import { REFINERIES } from "./refineries";
import type { FocusTarget } from "./types";
import ChinaDetail from "./ChinaDetail";

const NAMES: Record<string, string> = { tanker_transits_7d: "Tanker transits · 7-day average", tanker_volume_7d: "Tanker volume · 7-day average", bunker_sales: "Bunker sales · monthly", tanker_arrivals: "Tanker arrivals · monthly" };
export default function CorridorDetail({ id, title, metrics, failed, onFocus }: {
  id: string; title: string; metrics: CorridorMetricLatest[] | null; failed: boolean; onFocus: (target: FocusTarget) => void;
}) {
  const [expanded, setExpanded] = useState("tanker_transits_7d");
  if (id === "china") return <ChinaDetail metrics={metrics} failed={failed} />;
  const corridor = id === "sg" ? "singapore" : id === "usgc" ? "usgulf" : id;
  const rows = (metrics ?? []).filter(m => m.corridor === corridor && NAMES[m.metric]);
  const facilities = REFINERIES.filter(r => r.corridorId === id);
  return <div className="space-y-5">
    <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Corridor intelligence</p><h3 className="mt-2 text-xl text-[var(--ink)]">{title}</h3></div>
    {id === "usgc" ? <PhysicalOverview metrics={metrics} failed={failed} /> : <>
      <p className="text-xs leading-relaxed text-[var(--ink-2)]">{id === "sg" ? "Malacca Strait tanker traffic provides gate context for Singapore. MPA port statistics describe monthly Singapore activity." : id === "hormuz" ? "Reported tanker traffic through the Gulf export gate. AIS disruption and spoofing can affect counts; vessel counts do not establish oil cargo volume." : "Regional coverage is a watchlist. No current physical observations are connected."}</p>
      {failed && <p className="text-[10px] text-[#d4a157]">Physical feed refresh failed · retained observations below.</p>}
      {rows.length === 0 && <p className="text-xs text-[var(--ink-3)]">No traffic observations available.</p>}
      {rows.map(row => {
        const stale = metricFreshness(row) === "stale";
        const open = expanded === row.metric;
        return <section key={row.metric} className="border-t border-[var(--line)] pt-4"><button type="button" aria-expanded={open} onClick={() => setExpanded(open ? "" : row.metric)} className="w-full text-left hover:bg-white/[0.03]"><span className="text-[11px] text-[var(--ink-2)]">{NAMES[row.metric]}</span><span className="mt-2 block font-mono text-2xl text-[var(--ink)]">{row.value.toFixed(row.metric === "tanker_volume_7d" ? 3 : 1)} {row.unit}</span><span className="mt-2 block font-mono text-[9px] text-[var(--ink-3)]">{stale ? "Historical · stale" : "Reported"} · {row.periodDate}</span></button>
          <p className="mt-2 text-[10px] text-[var(--ink-3)]">{row.source} · source timestamp {row.observedAt.slice(0, 10)}</p>
          {stale && <p className="mt-2 text-[10px] text-[var(--ink-3)]">This reading does not describe current traffic.</p>}
          {open && <CorridorSpark key={`${corridor}-${row.metric}`} corridor={corridor} metric={row.metric} caption={`${NAMES[row.metric]} · ${row.unit}`} />}
        </section>;
      })}
    </>}
    {facilities.length > 0 && <section className="border-t border-[var(--line)] pt-4"><h4 className="font-mono text-[9px] uppercase tracking-wide text-[var(--ink-3)]">Connected refinery references</h4><div className="mt-2 flex flex-col">{facilities.map(r => <button type="button" key={r.id} onClick={() => onFocus({ kind: "refinery", id: r.id })} className="py-2 text-left text-xs text-[#d4a157] hover:bg-white/5">{r.name} →</button>)}</div></section>}
    <footer className="border-t border-[var(--line)] pt-3 text-[10px] text-[var(--ink-3)]"><a target="_blank" rel="noreferrer" className="text-[#d4a157] underline" href={id === "usgc" ? "https://www.eia.gov/petroleum/supply/weekly/" : "https://portwatch.imf.org/"}>{id === "usgc" ? "EIA weekly petroleum data ↗" : "IMF PortWatch ↗"}</a><p className="mt-2">Observation dates describe the source period; refresh times do not make older measurements current.</p></footer>
  </div>;
}
