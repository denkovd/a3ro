"use client";

import { useEffect, useRef, useState } from "react";
import { HOLDERS, type Holder } from "./holders";
import { MINE_REGIONS, type MineRegion, type MineLayerMode } from "./mines";
import { FLOW_ROUTES, type FlowRoute } from "./flowRoutes";
import { formatPrice, formatPct, type GoldSnapshot } from "./goldData";
import { findMetric, formatTonnes, formatToz, formatFlowT, type GoldFlowData, type GoldFlowMetric } from "./useGoldFlowData";
import { mineReading, reportStatus, sourceLabel } from "./dataQuality";
import GoldHistoryChart from "./GoldHistoryChart";

const GOLD = "#dcc689";
const KINDS = { central_bank: "Official reserves", etf: "Gold ETFs", warehouse: "Warehouse stocks", vault_hub: "Bullion hub" };
const CONTEXT: Record<string, { text: string; source?: string; url?: string }> = {
  etf_us: { text: "North American gold ETFs, including GLD and IAU. Weekly holdings changes track additions and withdrawals across funds; this pin represents a regional aggregate.", source: "World Gold Council", url: "https://www.gold.org/goldhub/data/global-gold-backed-etf-holdings-and-flows" },
  comex: { text: "Registered metal has a warrant and meets exchange delivery requirements. Eligible metal meets specifications but is not registered for delivery. A change in either category can reflect reclassification as well as deposits or withdrawals.", source: "CME gold stocks", url: "https://www.cmegroup.com/delivery_reports/Gold_Stocks.xls" },
  lbma: { text: "London is an OTC clearing and bullion vault hub. Monthly aggregate vault statistics are published by LBMA; those figures have not been connected to this location yet.", source: "LBMA vault data", url: "https://www.lbma.org.uk/prices-and-data/london-vault-data" },
  zurich: { text: "A Swiss refining and vault hub linking producing regions to bullion markets. This marker provides geographic context; a verified holdings or throughput series is not available here." },
  shanghai: { text: "A Chinese physical-gold trading and demand hub. Exchange activity, imports and central-bank reserves describe different parts of the market and should be considered separately." },
  dubai: { text: "A Middle Eastern bullion trading hub connecting regional demand and international supply. This location currently provides market context without a verified stock or flow series." },
  cb_us: { text: "Reported US official-sector gold reserves. The marker represents the institution, rather than the locations where its bars are stored." },
  cb_china: { text: "Reported Chinese official-sector gold reserves. These holdings are separate from Shanghai exchange activity and commercial gold imports." },
  cb_india: { text: "Reported Indian official-sector gold reserves. Jewellery demand and commercial imports are separate measures." },
  cb_euro: { text: "Euro-area official-sector gold reserves. This represents an aggregate, rather than a single central bank or vault." },
};

export function holderReport(holder: Holder, flow: GoldFlowData): GoldFlowMetric | null {
  return holder.id === "etf_us" ? findMetric(flow.metrics, "etf_us", "etf_holdings_t")
    : holder.id === "comex" ? findMetric(flow.metrics, "comex", "comex_registered_toz") : null;
}

export function holderStatus(holder: Holder, flow: GoldFlowData): string {
  return holder.id === "etf_us" || holder.id === "comex"
    ? reportStatus(holderReport(holder, flow), flow.status, !!flow.error)
    : holder.kind === "central_bank" ? "Reference" : "Watchlist";
}

function MetricRow({ label, metric, format }: { label: string; metric: GoldFlowMetric | null; format: (v: number) => string }) {
  if (!metric) return null;
  return <div className="flex items-start justify-between gap-3 py-1"><div><p className="text-[11px] text-[var(--ink-2)]">{label}</p><p className="font-mono text-[9px] text-[var(--ink-3)]">{metric.periodDate}</p></div><span className="font-mono text-[12px] tabular-nums text-[var(--ink)]">{format(metric.value)}</span></div>;
}

export default function GoldIntelPanel({ narrow, selectedHolder, selectedMine, selectedRoute, price, flow, mineMode, focusHolder, focusMine, focusRoute, closePanel }: {
  narrow: boolean;
  selectedHolder: Holder | null;
  selectedMine: MineRegion | null;
  selectedRoute: FlowRoute | null;
  price: GoldSnapshot;
  flow: GoldFlowData & { retry: () => void };
  mineMode: MineLayerMode;
  focusHolder: (holder: Holder) => void;
  focusMine: (mine: MineRegion) => void;
  focusRoute: (route: FlowRoute) => void;
  closePanel: () => void;
}) {
  const [directory, setDirectory] = useState<"holders" | "mines">("holders");
  const [search, setSearch] = useState("");
  const [collapsedFor, setCollapsedFor] = useState<string | null>(null);
  const selectionKey = selectedHolder?.id ?? selectedMine?.id ?? selectedRoute?.id ?? "overview";
  const mobileOpen = collapsedFor !== selectionKey;
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [selectionKey]);
  const hasFocus = !!(selectedHolder || selectedMine || selectedRoute);
  const query = search.trim().toLowerCase();
  const holders = HOLDERS.filter((h) => `${h.name} ${h.title} ${KINDS[h.kind]}`.toLowerCase().includes(query));
  const mines = [...MINE_REGIONS].sort((a, b) => mineMode === "share" ? b.share - a.share : b.productionT - a.productionT)
    .filter((m) => m.name.toLowerCase().includes(query));
  const primary = selectedHolder ? holderReport(selectedHolder, flow) : null;
  const context = selectedHolder ? CONTEXT[selectedHolder.id] : null;
  const reserveSource = selectedHolder?.kind === "central_bank" ? "https://www.gold.org/goldhub/data/gold-reserves-by-country" : null;
  const related = selectedHolder ? FLOW_ROUTES.filter((r) => r.gates.includes(selectedHolder.id as FlowRoute["gates"][number]))
    : selectedMine ? FLOW_ROUTES.filter((r) => r.pts.some(([lon, lat]) => lon === selectedMine.lon && lat === selectedMine.lat)) : [];
  const na = findMetric(flow.metrics, "etf_us", "etf_holdings_t");
  const reg = findMetric(flow.metrics, "comex", "comex_registered_toz");

  return (
    <aside aria-label="Gold intelligence" className={`absolute z-20 flex flex-col overflow-hidden rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.94)] backdrop-blur-md ${narrow ? "inset-x-3 bottom-14 max-h-[44%]" : "bottom-6 right-6 top-4 w-[340px]"}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">P·02 / Gold intelligence</p><h3 className="mt-1 text-sm font-medium text-[var(--ink)]">{hasFocus ? "Location detail" : "Mines · holders · flows"}</h3></div>
        {hasFocus ? <button type="button" onClick={closePanel} className="px-2 py-2 text-[11px] text-[var(--ink-2)] hover:text-[var(--ink)]" aria-label="Back to gold locations">← Back</button> : null}
        {narrow ? <button type="button" aria-expanded={mobileOpen} aria-controls="gold-intel-content" onClick={() => setCollapsedFor(mobileOpen ? selectionKey : null)} className="px-2 py-2 text-[11px] text-[var(--ink-2)]">{mobileOpen ? "Hide" : "Show"}</button> : null}
      </div>
      <div id="gold-intel-content" ref={contentRef} hidden={narrow && !mobileOpen} className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
        {hasFocus ? <section>
          {selectedHolder ? <>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">{KINDS[selectedHolder.kind]}</p>
            <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{selectedHolder.title}</h4>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: holderStatus(selectedHolder, flow) === "Latest report" ? GOLD : "var(--ink-2)" }}>{holderStatus(selectedHolder, flow)}{primary ? ` · ${primary.periodDate}` : ""}</p>
            {primary ? <>
              <p className="mt-3 font-mono text-3xl tabular-nums text-[var(--ink)]">{selectedHolder.id === "comex" ? formatToz(primary.value) : formatTonnes(primary.value)}</p>
              <p className="mt-1 text-[11px] text-[var(--ink-3)]">{sourceLabel(primary.source)} · {selectedHolder.id === "comex" ? "Registered stock" : "North American ETF holdings"}</p>
            </> : <div className="mt-3 border-l-2 border-[var(--line)] pl-3 text-[11px] leading-relaxed text-[var(--ink-3)]">{flow.status === "loading" && (selectedHolder.id === "comex" || selectedHolder.id === "etf_us") ? "Loading the latest published report…" : selectedHolder.kind === "central_bank" ? "Reserve figures have not been connected yet. Explore the published source and the location’s market role below." : "No verified holdings figure is available here yet. Market context and related connections are shown below."}</div>}
            {selectedHolder.id === "etf_us" ? <div className="mt-3">
              <MetricRow label="Weekly holdings change" metric={findMetric(flow.metrics, "etf_us", "etf_flow_t")} format={formatFlowT} />
              <MetricRow label="Global ETF holdings" metric={findMetric(flow.metrics, "etf_global", "etf_holdings_t")} format={formatTonnes} />
            </div> : null}
            {selectedHolder.id === "comex" ? <div className="mt-3">
              <MetricRow label="Eligible" metric={findMetric(flow.metrics, "comex", "comex_eligible_toz")} format={formatToz} />
              <MetricRow label="Total stock" metric={findMetric(flow.metrics, "comex", "comex_combined_toz")} format={formatToz} />
              <MetricRow label="Registered change vs previous report" metric={findMetric(flow.metrics, "comex", "comex_registered_delta_toz")} format={(v) => `${v > 0 ? "+" : ""}${formatToz(v)}`} />
            </div> : null}
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">{context?.text}</p>
            {context?.url || reserveSource ? <a href={context?.url ?? reserveSource!} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] underline" style={{ color: GOLD }}>{context?.source ?? "WGC reported reserves"} ↗</a> : null}
            {selectedHolder.id === "etf_us" || selectedHolder.id === "comex" ? <>
              {flow.error ? <p className="mt-2 text-[10px] text-[var(--ink-3)]">Latest refresh failed; retained readings may be outdated.</p> : null}
              <button type="button" onClick={flow.retry} disabled={flow.status === "loading"} className="ml-3 mt-2 text-[11px] text-[var(--ink-2)] underline disabled:opacity-50">Refresh reports</button>
              <GoldHistoryChart key={selectedHolder.id} holderId={selectedHolder.id} refreshedAt={flow.lastFetchedAt} />
            </> : null}
          </> : null}
          {selectedMine ? <>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Mine production region</p>
            <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{selectedMine.name}</h4>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">Annual reference · {selectedMine.asOf}</p>
            <p className="mt-3 font-mono text-3xl tabular-nums" style={{ color: GOLD }}>{mineReading(selectedMine, mineMode)}</p>
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">{mineMode === "production" ? "Estimated annual mine production" : "Approximate share of global mine supply"}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3"><div><dt className="text-[10px] text-[var(--ink-3)]">Production</dt><dd className="mt-1 font-mono text-[13px] text-[var(--ink)]">~{selectedMine.productionT} t/year</dd></div><div><dt className="text-[10px] text-[var(--ink-3)]">Global share</dt><dd className="mt-1 font-mono text-[13px] text-[var(--ink)]">~{(selectedMine.share * 100).toFixed(0)}%</dd></div></dl>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">This marker represents a producing region. Figures are approximate {selectedMine.asOf} annual references, rather than an individual mine’s current output.</p>
            <p className="mt-2 text-[10px] text-[var(--ink-3)]">Dataset: curated USGS / WGC-style reference; figures have not been refreshed for the current year.</p>
          </> : null}
          {selectedRoute ? <>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Market connection</p>
            <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{selectedRoute.name}</h4>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: GOLD }}>Illustrative route</p>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">This line illustrates a relationship between producing regions, trading hubs or holders. Its direction, width and animation do not measure current shipments or trading volume. ETF holdings changes and warehouse stock changes do not establish transfers along this route.</p>
            <h5 className="mt-4 text-[11px] text-[var(--ink-3)]">Explore connected locations</h5>
            {HOLDERS.filter((h) => selectedRoute.gates.includes(h.id as FlowRoute["gates"][number])).map((h) => <button type="button" key={h.id} onClick={() => focusHolder(h)} className="mt-2 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink)] hover:bg-[var(--depth-2)]">{h.title} ↗</button>)}
            {MINE_REGIONS.filter((m) => selectedRoute.pts.some(([lon, lat]) => lon === m.lon && lat === m.lat)).map((m) => <button type="button" key={m.id} onClick={() => focusMine(m)} className="mt-2 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink)] hover:bg-[var(--depth-2)]">{m.name} mine region ↗</button>)}
          </> : null}
          {related.length ? <div className="mt-4 border-t border-[var(--line)] pt-3"><h5 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Related illustrative connections</h5>{related.map((r) => <button type="button" key={r.id} onClick={() => focusRoute(r)} className="mt-2 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">{r.name} ↗</button>)}</div> : null}
          <p className="mt-4 border-t border-[var(--line)] pt-3 text-[10px] text-[var(--ink-3)]">Locations represent economic hubs, rather than vault coordinates.</p>
        </section> : <>
          <section aria-label="Gold market overview" className="border-b border-[var(--line)] pb-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Spot · XAU · {price.price.currency} / {price.price.unit}</p>
            <p className="mt-1 font-mono text-3xl tabular-nums text-[var(--ink)]">{formatPrice(price.price.value)}</p>
            <div className="mt-2 flex gap-4 font-mono text-[10px] text-[var(--ink-2)]"><span>{formatPct(price.changes.d1)} · 1D</span><span>{formatPct(price.changes.w1)} · 1W</span></div>
            <p className="mt-2 text-[10px] text-[var(--ink-3)]">{price.source === "live" ? "Latest stored quote" : "Sample baseline"} · {price.asOf.slice(0, 10)} {price.asOf.slice(11, 16)} UTC</p>
          </section>
          <section aria-label="Latest stock reports" className="mt-3">
            <h4 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Stock / flow reports</h4>
            {[{ h: HOLDERS[0], m: na, label: "North American ETFs", format: formatTonnes }, { h: HOLDERS[1], m: reg, label: "COMEX registered", format: formatToz }].map(({ h, m, label, format }) => <button type="button" key={h.id} onClick={() => focusHolder(h)} className="mt-2 block w-full rounded-sm border border-[var(--line)] p-3 text-left transition-colors hover:bg-[var(--depth-2)]"><div className="flex items-center justify-between gap-2"><span className="text-[11px] text-[var(--ink-2)]">{label}</span><span className="text-[9px]" style={{ color: holderStatus(h, flow) === "Latest report" ? GOLD : "var(--ink-3)" }}>{holderStatus(h, flow)}</span></div><p className="mt-1 font-mono text-[17px] text-[var(--ink)]">{m ? format(m.value) : flow.status === "loading" ? "Loading report…" : "Report unavailable"}</p><p className="mt-1 text-[10px] text-[var(--ink-3)]">{m ? `${sourceLabel(m.source)} · ${m.periodDate}` : "Explore context and report history"} ↗</p></button>)}
            {flow.status === "error" || flow.status === "empty" || flow.error ? <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--ink-3)]"><span>{flow.status === "empty" ? "No stock reports stored yet." : "Reports could not be refreshed."}</span><button type="button" onClick={flow.retry} className="shrink-0 text-[var(--ink-2)] underline">Retry reports</button></div> : null}
          </section>
          <section aria-label="Location explorer" className="mt-4 border-t border-[var(--line)] pt-3">
            <div role="group" aria-label="Location category" className="flex gap-3">
              {(["holders", "mines"] as const).map((tab) => <button type="button" key={tab} aria-pressed={directory === tab} onClick={() => { setDirectory(tab); setSearch(""); }} className="py-1 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: directory === tab ? GOLD : "var(--ink-3)" }}>{tab} · {tab === "holders" ? HOLDERS.length : MINE_REGIONS.length}</button>)}
            </div>
            <label className="sr-only" htmlFor="gold-location-search">Search gold locations</label><input id="gold-location-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${directory}…`} className="mt-2 w-full rounded-sm border border-[var(--line)] bg-transparent px-3 py-2 text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-3)]" />
            {directory === "holders" ? <ul className="mt-2 divide-y divide-[var(--line)]">{holders.map((h) => <li key={h.id}><button type="button" onClick={() => focusHolder(h)} className="flex w-full items-center justify-between gap-2 rounded-sm px-1 py-2 text-left hover:bg-[var(--depth-2)]"><span><span className="block font-mono text-[10px] text-[var(--ink)]">{h.name}</span><span className="text-[9px] text-[var(--ink-3)]">{KINDS[h.kind]}</span></span><span className="text-right text-[9px] text-[var(--ink-3)]">{holderStatus(h, flow)}</span></button></li>)}</ul>
              : <><p className="mt-2 text-[10px] text-[var(--ink-3)]">Approximate 2024 annual references · ranked by {mineMode === "share" ? "share" : "production"}</p><ul className="mt-2 divide-y divide-[var(--line)]">{mines.map((m, i) => <li key={m.id}><button type="button" onClick={() => focusMine(m)} className="flex w-full items-center justify-between gap-2 rounded-sm px-1 py-2 text-left hover:bg-[var(--depth-2)]"><span className="font-mono text-[10px] text-[var(--ink)]">{query ? "" : `${String(i + 1).padStart(2, "0")} · `}{m.name}</span><span className="font-mono text-[10px]" style={{ color: GOLD }}>{mineReading(m, mineMode)}</span></button></li>)}</ul></>}
            {(directory === "holders" ? holders.length : mines.length) === 0 ? <p className="mt-3 text-[11px] text-[var(--ink-3)]">No matching locations.</p> : null}
          </section>
        </>}
      </div>
    </aside>
  );
}
