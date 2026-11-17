"use client";
import { useId, useMemo, useRef, useState } from "react";
import { companyAssets, filterIsActive, searchEntities, EMPTY_FILTER, type Graph, type RefineryFilter, type SearchHit, type SearchItem } from "./graph";

const KIND: Record<SearchHit["kind"], string> = { refinery: "Refinery", company: "Company", corridor: "Corridor", route: "Route", country: "Country" };
const STATUS: { id: RefineryFilter["status"]; label: string; title: string }[] = [
  { id: "all", label: "All", title: "Every covered refinery" },
  { id: "closed", label: "Closed / idled", title: "Operator-confirmed closure or idling" },
  { id: "disrupted", label: "Disruption history", title: "Any sourced outage, maintenance or disruption record" },
  { id: "unverified", label: "Status unverified", title: "No current sourced operating condition" },
];

export default function AssetSearch({ graph, corpus, filter, onFilter, matchCount, onSelect, onFit, compact }: {
  graph: Graph; corpus: SearchItem[]; filter: RefineryFilter; onFilter: (f: RefineryFilter) => void;
  matchCount: number; onSelect: (hit: SearchHit) => void; onFit: () => void; compact: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hits = useMemo(() => searchEntities(corpus, query, compact ? 6 : 8), [corpus, query, compact]);
  const countries = useMemo(() => [...new Set(graph.refineries.map(r => r.country))].sort(), [graph.refineries]);
  const companies = useMemo(() => graph.companies.filter(c => companyAssets(graph, c.id).some(a => !a.former)).sort((a, b) => a.name.localeCompare(b.name)), [graph]);
  const activeFilters = [filter.status !== "all", !!filter.country, !!filter.companyId, filter.developments].filter(Boolean).length;
  const total = graph.refineries.length;

  const choose = (hit: SearchHit) => { onSelect(hit); setQuery(""); setOpen(false); inputRef.current?.blur(); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(i => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && hits[active]) { e.preventDefault(); choose(hits[active]); }
    else if (e.key === "Escape") { if (query) setQuery(""); else inputRef.current?.blur(); setOpen(false); }
  };
  const chip = (on: boolean) => `min-h-8 border px-2.5 py-1 text-[11px] transition-colors duration-[var(--dur-micro)] ${on ? "border-[var(--asset-accent-line)] bg-[var(--asset-accent-soft)] text-[var(--ink)]" : "border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--line-2)]"}`;
  const select = "min-h-8 w-full border border-[var(--line)] bg-[var(--depth-1)] px-2 text-[11px] text-[var(--ink-2)]";

  return <div role="search" aria-label="Find oil assets" className={compact ? "w-full" : "w-[360px]"}>
    <div className="flex items-stretch border border-[var(--line)] bg-[var(--panel)] backdrop-blur-md focus-within:border-[var(--line-2)]">
      <svg aria-hidden viewBox="0 0 16 16" className="ml-3 h-4 w-4 shrink-0 self-center text-[var(--ink-3)]"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.3" /></svg>
      <input ref={inputRef} type="search" role="combobox" aria-label="Search oil assets" aria-expanded={open && query.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
        value={query} onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKey}
        placeholder="Search refineries, companies…" className="min-h-11 min-w-0 flex-1 bg-transparent px-3 [&::-webkit-search-cancel-button]:appearance-none text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none" />
      <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(v => !v)} className="shrink-0 border-l border-[var(--line)] px-3 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: activeFilters || filtersOpen ? "var(--asset-accent)" : "var(--ink-3)" }}>
        Filter{activeFilters ? ` · ${activeFilters}` : ""}
      </button>
    </div>

    {open && query.trim() && <div className="border border-t-0 border-[var(--line)] bg-[var(--panel)] backdrop-blur-md">
      {hits.length ? <ul id={listId} role="listbox" aria-label="Search results" className="max-h-[50vh] overflow-y-auto py-1">
        {hits.map((hit, i) => <li key={`${hit.kind}:${hit.id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
          onMouseDown={e => { e.preventDefault(); choose(hit); }} onMouseEnter={() => setActive(i)}
          className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 ${i === active ? "bg-white/[0.05]" : ""}`}>
          <span className="min-w-0"><span className="block truncate text-[13px] text-[var(--ink)]">{hit.label}</span><span className="block truncate text-[11px] text-[var(--ink-3)]">{hit.detail}</span></span>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{KIND[hit.kind]}</span>
        </li>)}
      </ul> : <p id={listId} role="status" className="px-3 py-3 text-xs text-[var(--ink-3)]">No match among {total} refineries, their documented companies, corridors and routes.</p>}
    </div>}

    {filtersOpen && <div className="space-y-3 border border-t-0 border-[var(--line)] bg-[var(--panel)] p-3 backdrop-blur-md">
      <fieldset><legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Operating evidence</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">{STATUS.map(s => <button key={s.id} type="button" title={s.title} aria-pressed={filter.status === s.id} onClick={() => onFilter({ ...filter, status: s.id })} className={chip(filter.status === s.id)}>{s.label}</button>)}</div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Country</span>
          <select value={filter.country ?? ""} onChange={e => onFilter({ ...filter, country: e.target.value || null })} className={`mt-1 ${select}`}><option value="">Any</option>{countries.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="block"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Company</span>
          <select value={filter.companyId ?? ""} onChange={e => onFilter({ ...filter, companyId: e.target.value || null })} className={`mt-1 ${select}`}><option value="">Any</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <button type="button" aria-pressed={filter.developments} onClick={() => onFilter({ ...filter, developments: !filter.developments })} className={chip(filter.developments)}>Has dated developments or events</button>
      <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">Company matches sites it operates, owns, or holds through a documented subsidiary.</p>
    </div>}

    {(filterIsActive(filter) || filtersOpen) && <div className="flex items-center justify-between gap-2 border border-t-0 border-[var(--line)] bg-[var(--panel)] px-3 py-2 backdrop-blur-md">
      <p role="status" className="font-mono text-[11px] text-[var(--ink-2)]"><span className="text-[var(--ink)]">{matchCount}</span> of {total} refineries</p>
      <div className="flex gap-1">
        <button type="button" disabled={!matchCount || !filterIsActive(filter)} onClick={onFit} className="min-h-8 px-2 text-[11px] text-[var(--asset-accent)] hover:bg-white/[0.05] disabled:text-[var(--ink-3)]">Fit to map</button>
        <button type="button" disabled={!filterIsActive(filter)} onClick={() => onFilter(EMPTY_FILTER)} className="min-h-8 px-2 text-[11px] text-[var(--ink-2)] hover:bg-white/[0.05] disabled:text-[var(--ink-3)]">Clear</button>
      </div>
    </div>}
  </div>;
}
