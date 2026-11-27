"use client";
/* Right rail for the Iron Ore Tracker: overview by default, detail when something is selected.
   Built from the shared Commodity Watch rail kit. Australia's export value is live from the ABS
   (/api/ironore/exports); everything else is reference data from lib/ironore/reference.ts. */
import { useState } from "react";
import {
  CompanyList, Explorer, Headline, Kicker, MonthlyPriceBlock, RailSection, useMonthlyPrice, RailShell, SourceLink as RailSourceLink, SourceList, Stat, n, pct, rowBtn,
} from "../commodity/RailKit";
import type { RailApi } from "../commodity/CommodityGlobe";
import { DEMAND_CSS, IRON_CSS } from "../ironOreTrackerShared";
import {
  COMPANIES, DESTINATIONS, IMPORTERS, MINES, PILBARA_IRON_ORE_MT, PORTS, PRODUCERS, PRODUCTION_YEAR, REQ_OUTLOOK, SIMANDOU, SOURCES,
  TRADE_YEAR, WA, WORLD_PRODUCTION_MT, WORLD_PRODUCTION_WA_MT, WORLD_TRADE_MT, type SourceId,
} from "../../../../lib/ironore/reference";
import { periodLabel } from "../../../../lib/commodity/absExports";
import ExportsBlock, { audBn } from "../commodity/ExportsBlock";
import { COST_SOURCES, IMPACT_REVIEWED, IRON_ORE_BANDS, TREASURY_SENSITIVITY, WA_ASSUMPTION, bandFor } from "../../../../lib/ironore/impact";
import type { ExportsState } from "../IronOreTrackerCore";

const IRN = IRON_CSS;
const DEM = DEMAND_CSS;

function SourceLink({ id }: { id: SourceId }) {
  return <RailSourceLink source={SOURCES[id]} accent={IRN} />;
}

type Tab = "producers" | "importers" | "ports" | "mines";

/** What the price means for Australia (#126): where it sits against miners' costs, and Treasury's official sensitivity. */
function ImpactBlock({ price }: { price: number | null }) {
  const max = 160, band = price === null ? null : bandFor(price);
  const tone = ["#c9573f", "#e0a44a", "#8fbf6a", "#5fc9a4"];
  const t = TREASURY_SENSITIVITY;
  return <RailSection label="What it means for Australia" kicker="What the price means for Australia">
    <div className="relative mt-3 h-3 w-full overflow-hidden rounded-sm" role="img" aria-label={price === null ? "Price bands" : `US$${price.toFixed(0)} a tonne sits in the ${band!.label} band`}>
      {IRON_ORE_BANDS.map((b, i) => <div key={b.label} className="absolute top-0 h-full" style={{ left: `${(b.from / max) * 100}%`, width: `${((Math.min(b.to, max) - b.from) / max) * 100}%`, background: tone[i], opacity: band?.label === b.label ? 0.9 : 0.35 }} />)}
      {price !== null ? <div className="absolute top-[-2px] h-[calc(100%+4px)] w-[3px] rounded-sm bg-white" style={{ left: `calc(${(Math.min(price, max) / max) * 100}% - 1px)` }} /> : null}
    </div>
    <div className="mt-1 flex justify-between font-mono text-[8px] text-[var(--ink-3)]">{[0, 40, 80, 120, 160].map((v) => <span key={v}>${v}</span>)}</div>
    {band ? <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]"><span className="font-medium text-[var(--ink)]">{band.label}.</span> {band.detail}</p> : null}
    {price !== null ? <p className="mt-1 text-[10px] text-[var(--ink-3)]">WA&rsquo;s budget assumes US${WA_ASSUMPTION.fy2027} this financial year (US${WA_ASSUMPTION.longRun} in the long run); last month&rsquo;s average was {price >= WA_ASSUMPTION.fy2027 ? "above" : "below"} that.</p> : null}
    <p className="mt-3 text-[10px] text-[var(--ink-3)]">Treasury: each US$10 a tonne, if it lasts</p>
    <table className="mt-1 w-full text-right font-mono text-[10px]"><thead><tr className="text-[9px] text-[var(--ink-3)]"><th className="text-left font-normal" />{t.years.map((y) => <th key={y} className="font-normal">{y}</th>)}</tr></thead>
      <tbody>
        <tr><td className="text-left font-sans text-[var(--ink-2)]">Nominal GDP</td>{t.nominalGdpBn.map((v, i) => <td key={i}>±A${v}bn</td>)}</tr>
        <tr><td className="text-left font-sans text-[var(--ink-2)]">Tax receipts</td>{t.taxReceiptsBn.map((v, i) => <td key={i}>±A${v}bn</td>)}</tr>
      </tbody></table>
    <p className="mt-2 text-[9px] leading-relaxed text-[var(--ink-3)]">Bands are our reading of published mining costs (majors spend about US$18–25 a tonne to get ore to port, before freight, royalties and upkeep), not a forecast; company profits also depend on volumes, costs and the Australian dollar. Treasury&rsquo;s figures are for the price before freight (FOB). Checked {IMPACT_REVIEWED}. Sources: <a className="underline" href={t.source.url} target="_blank" rel="noreferrer">{t.source.label}</a>; <a className="underline" href={WA_ASSUMPTION.source.url} target="_blank" rel="noreferrer">{WA_ASSUMPTION.source.label}</a>; {COST_SOURCES.map((c, i) => <span key={c.url}>{i ? "; " : ""}<a className="underline" href={c.url} target="_blank" rel="noreferrer">{c.label}</a></span>)}.</p>
  </RailSection>;
}

export default function IronOreIntelPanel({ narrow, selected, focus, close, exportsState }: RailApi & { exportsState: ExportsState }) {
  const [tab, setTab] = useState<Tab>("producers");
  const colon = selected ? selected.indexOf(":") : -1;
  const kind = selected && colon > 0 ? selected.slice(0, colon) : selected;
  const key = selected && colon > 0 ? selected.slice(colon + 1) : selected;
  const live = exportsState.status === "ok" ? exportsState.data : null;

  const detail = (() => {
    if (!selected) return null;
    if (kind === "p") {
      const p = PRODUCERS.find((x) => x.id === key);
      if (!p) return null;
      const mines = MINES.filter((m) => m.country === p.id);
      return <>
        <Kicker>Producer · {PRODUCTION_YEAR}</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{p.name}</h4>
        <Headline value={`${n(p.mt2025)} Mt`} sub={`Usable ore ${PRODUCTION_YEAR} (USGS estimate) · ${pct(p.mt2025 / WORLD_PRODUCTION_MT)} of world output`} color={IRN} />
        <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3">
          <Stat label={`${PRODUCTION_YEAR - 1}${p.estimate2024 ? " (est.)" : ""}`} value={`${n(p.mt2024)} Mt`} />
          <Stat label="Change" value={`${p.mt2025 >= p.mt2024 ? "+" : ""}${n(Math.round((p.mt2025 - p.mt2024) * 10) / 10)} Mt`} />
        </dl>
        {p.mostlyDomestic ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">Most of this ore feeds local steelmaking rather than the seaborne market.</p> : null}
        {p.id === "australia" ? <AustraliaBox /> : null}
        {mines.length ? <div className="mt-3"><Kicker>Mines on the globe</Kicker><ul className="mt-1 divide-y divide-[var(--line)]">{mines.map((m) => <li key={m.id}><button type="button" onClick={() => focus(`mine:${m.id}`)} className={rowBtn}><span className="text-[11px] text-[var(--ink)]">{m.name}</span><span className="text-[9px] text-[var(--ink-3)]">{m.owner}</span></button></li>)}</ul></div> : null}
        <SourceLink id="usgs" />
      </>;
    }
    if (kind === "port") {
      const p = PORTS.find((x) => x.id === key);
      if (!p) return null;
      return <>
        <Kicker>Export port · Western Australia</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{p.name}</h4>
        <p className="mt-1 text-[11px] text-[var(--ink-2)]">{p.operators}</p>
        {p.throughputMt !== null ? <Headline value={`${n(p.throughputMt)} Mt`} sub={`Total throughput, 2025-26${p.ironOreMt ? ` · iron ore ${p.ironOreMt} Mt` : ""}`} color={IRN} />
          : <p className="mt-3 border-l-2 border-[var(--line)] pl-3 text-[11px] text-[var(--ink-3)]">Tonnage is not published in our sources.</p>}
        {p.note ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">{p.note}</p> : null}
        <p className="mt-2 text-[10px] text-[var(--ink-3)]">Pilbara Ports (Port Hedland, Dampier, Ashburton) exported {PILBARA_IRON_ORE_MT} Mt of iron ore in 2025-26.</p>
        <SourceLink id={p.source} />
      </>;
    }
    if (kind === "mine") {
      const m = MINES.find((x) => x.id === key);
      if (!m) return null;
      const country = PRODUCERS.find((p) => p.id === m.country);
      return <>
        <Kicker>Mine</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{m.name}</h4>
        <p className="mt-1 text-[11px] text-[var(--ink-2)]">{m.owner}</p>
        {m.note ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">{m.note}</p> : null}
        {m.id === "simandou" ? <SimandouBox /> : null}
        {country ? <button type="button" onClick={() => focus(`p:${country.id}`)} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">{country.name}: {n(country.mt2025)} Mt in {PRODUCTION_YEAR} ↗</button> : null}
        <p className="mt-3 text-[10px] text-[var(--ink-3)]">Mine-level output is not published consistently, so it is counted in the country and company totals. Position is approximate.</p>
      </>;
    }
    if (kind === "flow") {
      const dest = DESTINATIONS.find((x) => x.code === key);
      if (!dest) return null;
      const d = live?.destinations.find((x) => x.code === key);
      return <>
        <Kicker>Australian exports · iron ore</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">Australia → {dest.name}</h4>
        {d ? <>
          <Headline value={audBn(d.last12AudM)} sub={`Last 12 months to ${periodLabel(live!.latestPeriod)} · ${pct(d.share)} of Australia's iron ore exports`} color={IRN} />
          <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3">
            <Stat label={periodLabel(live!.latestPeriod)} value={d.latestAudM !== null ? audBn(d.latestAudM) : "—"} />
            <Stat label="Share of total" value={pct(d.share)} />
          </dl>
        </> : <p className="mt-3 border-l-2 border-[var(--line)] pl-3 text-[11px] text-[var(--ink-3)]">{exportsState.status === "loading" ? "Loading ABS figures…" : `ABS figures unavailable. In ${WA.period}, ${dest.name} took about ${pct(WA.valueShares.find((v) => v.name === dest.name)?.share ?? 0)} of WA's iron ore export value.`}</p>}
        {(() => { const imp = IMPORTERS.find((i) => i.name === dest.name); return imp ? <button type="button" onClick={() => focus(imp.id)} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">{imp.name} imported {n(imp.mt)} Mt from all suppliers in {TRADE_YEAR} ↗</button> : null; })()}
        <p className="mt-3 text-[10px] text-[var(--ink-3)]">Arcs start at Port Hedland for clarity; ships also leave Dampier, Cape Lambert and Ashburton.</p>
        <a href={SOURCES.abs.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] underline" style={{ color: IRN }}>{SOURCES.abs.label} ↗</a>
      </>;
    }
    const imp = IMPORTERS.find((x) => x.id === selected);
    if (!imp) return null;
    const flow = DESTINATIONS.find((dd) => dd.name === imp.name);
    return <>
      <Kicker>Importer · {TRADE_YEAR}</Kicker>
      <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{imp.name}</h4>
      <Headline value={`${n(imp.mt)} Mt`} sub={`Iron ore imports ${TRADE_YEAR} · ${(imp.share * 100).toFixed(1)}% of world imports`} color={DEM} />
      {imp.id === "imp-china" ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">China makes about half the world&apos;s steel and buys most seaborne iron ore, so its property and construction cycle sets the price. Simandou adds a large new non-Australian supplier from 2026.</p> : null}
      {flow ? <button type="button" onClick={() => focus(`flow:${flow.code}`)} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">Australian exports to {imp.name} ↗</button> : null}
      <SourceLink id="waProfile" />
    </>;
  })();

  const producersRanked = [...PRODUCERS].sort((a, b) => b.mt2025 - a.mt2025);
  const price = useMonthlyPrice("iron_ore");

  return (
    <RailShell id="ironore-intel-content" label="Iron ore intelligence" kicker="P·03 / Iron ore intelligence" title="Pit → port → steel mill"
      narrow={narrow} selectedKey={selected} onBack={close} backLabel="Back to iron ore overview">
      {detail ? <section>{detail}</section> : <>
        <MonthlyPriceBlock data={price} kicker="Price · 62% Fe fines, CFR China" accent={IRN} per="a dry tonne"
          note="The benchmark for seaborne fines delivered to China." />
        <ImpactBlock price={price && price !== "error" ? price.summary?.latest.value ?? null : null} />

        <RailSection label="Australian exports" kicker="Australia's iron ore exports · ABS">
          <ExportsBlock state={exportsState} accent={IRN} colors={[IRN]} focus={focus} sourceUrl={SOURCES.abs.url} sourceLabel={SOURCES.abs.label}
            fallback={<>
              <p className="mt-2 text-[11px] text-[var(--ink-3)]">Western Australia&apos;s {WA.period} totals instead:</p>
              <dl className="mt-2 grid grid-cols-2 gap-3"><Stat label={`Value, ${WA.period}`} value={`A$${WA.exportsValueAudBn}bn`} /><Stat label={`Volume, ${WA.period}`} value={`${n(WA.exportsMt)} Mt`} /></dl>
              <SourceLink id="waProfile" />
            </>} />
        </RailSection>

        <RailSection label="Supply and demand" kicker={`Supply vs demand · ${TRADE_YEAR}`}>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Stat label="Mined worldwide" value={`${n(WORLD_PRODUCTION_WA_MT)} Mt`} sub={`${n(WORLD_TRADE_MT)} Mt of it traded between countries (${pct(WORLD_TRADE_MT / WORLD_PRODUCTION_WA_MT)})`} />
            <Stat label="China imported" value={`${n(IMPORTERS[0].mt)} Mt`} sub={`${(IMPORTERS[0].share * 100).toFixed(1)}% of world imports`} />
          </dl>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">Australia and Brazil supply most of the seaborne market; China, India and Russia mine a lot but use it at home. One buyer, China, takes nearly three quarters of all imports.</p>
          <SimandouBox />
          <SourceLink id="waProfile" />
        </RailSection>

        <RailSection label="Outlook" kicker="Outlook · Department of Industry">
          <dl className="mt-2 grid grid-cols-3 gap-2">{REQ_OUTLOOK.points.map((p) => <Stat key={p.year} label={p.year} value={`A$${p.audBn}bn`} />)}</dl>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">Forecast export earnings in real terms. {REQ_OUTLOOK.note} {WA.priceForecast}</p>
          <SourceLink id="req" />
        </RailSection>

        <RailSection label="Australia"><AustraliaBox /></RailSection>

        <Explorer<Tab>
          tabs={[{ id: "producers", label: "producers" }, { id: "importers", label: "importers" }, { id: "ports", label: "ports" }, { id: "mines", label: "mines" }]}
          current={tab} onTab={setTab} accentFor={(t) => (t === "importers" ? DEM : IRN)}
          footnote={tab === "producers" ? `Usable ore, ${PRODUCTION_YEAR}, USGS estimates` : tab === "importers" ? `${TRADE_YEAR} imports, WA Government profile` : tab === "ports" ? "Total throughput, 2025-26" : "Positions approximate"}>
          {tab === "producers" ? producersRanked.map((p, i) => <li key={p.id}><button type="button" onClick={() => focus(`p:${p.id}`)} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{String(i + 1).padStart(2, "0")} · {p.name}</span><span className="font-mono text-[10px]" style={{ color: IRN }}>{n(p.mt2025)} Mt</span></button></li>)
            : tab === "importers" ? IMPORTERS.map((x) => <li key={x.id}><button type="button" onClick={() => focus(x.id)} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{x.name}</span><span className="font-mono text-[10px]" style={{ color: DEM }}>{n(x.mt)} Mt</span></button></li>)
            : tab === "ports" ? PORTS.map((p) => <li key={p.id}><button type="button" onClick={() => focus(`port:${p.id}`)} className={rowBtn}><span><span className="block font-mono text-[10px] text-[var(--ink)]">{p.name}</span><span className="text-[9px] text-[var(--ink-3)]">{p.operators}</span></span><span className="font-mono text-[10px]" style={{ color: IRN }}>{p.throughputMt !== null ? `${n(p.throughputMt)} Mt` : "—"}</span></button></li>)
            : MINES.map((m) => <li key={m.id}><button type="button" onClick={() => focus(`mine:${m.id}`)} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{m.name}</span><span className="text-[9px] text-[var(--ink-3)]">{m.owner}</span></button></li>)}
        </Explorer>

        <CompanyList companies={COMPANIES} accent={IRN} note="Companies with iron ore exposure, not a recommendation. Shipments are each company's Western Australian figures for 2025-26 (WA Government profile)." />

        <SourceList sources={Object.values(SOURCES)} note="Reference figures are updated by hand from the sources above each quarter; Australia's export value comes live from the ABS. Mine and port positions are approximate." />
      </>}
    </RailShell>
  );
}

function AustraliaBox() {
  const au = PRODUCERS.find((p) => p.id === "australia")!;
  return <div className="mt-3 rounded-sm border border-[var(--line)] p-3">
    <Kicker>Australia</Kicker>
    <dl className="mt-2 grid grid-cols-3 gap-2">
      <Stat label="World output" value={pct(au.mt2025 / WORLD_PRODUCTION_MT)} sub={`${PRODUCTION_YEAR}, #1`} />
      <Stat label={`WA exports`} value={`${n(WA.exportsMt)} Mt`} sub={WA.period} />
      <Stat label="Export value" value={`A$${WA.exportsValueAudBn}bn`} sub={WA.period} />
    </dl>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">Australia&apos;s largest export. Almost all of it is mined in the Pilbara and shipped from four ports, and {pct(WA.valueShares[0].share)} of the value goes to China. Swings in the price move the Australian dollar, company tax receipts and the federal budget.</p>
    <SourceLink id="waProfile" />
  </div>;
}

function SimandouBox() {
  return <div className="mt-3 rounded-sm border border-[var(--line)] p-3">
    <Kicker>New supply · Simandou, Guinea</Kicker>
    <dl className="mt-2 grid grid-cols-2 gap-2">
      <Stat label="Capacity" value={`${SIMANDOU.capacityMt} Mt/yr`} sub="after ramp-up" />
      <Stat label="Started" value={SIMANDOU.started} />
    </dl>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">{SIMANDOU.note}</p>
    <SourceLink id={SIMANDOU.source} />
  </div>;
}
