"use client";
/* Right rail for the LNG Tracker: overview by default, detail when something is selected.
   Built from the shared Commodity Watch rail kit. Live: Australia's LNG exports (ABS).
   Everything else is reference data from lib/lng/reference.ts. */
import { useState } from "react";
import {
  CompanyList, Explorer, Headline, Kicker, PriceBlock, RailSection, RailShell, SourceLink as RailSourceLink, SourceList, Stat, pct, rowBtn,
} from "../commodity/RailKit";
import ExportsBlock, { audBn, type Loadable } from "../commodity/ExportsBlock";
import type { RailApi } from "../commodity/CommodityGlobe";
import { BUYER_CSS, LNG_CSS } from "../lngTrackerShared";
import {
  COMPANIES, DESTINATIONS, EXPORTERS, HORMUZ, IMPORTERS, OUTLOOK, PILBARA_LNG_MT, PLANTS, SOURCES, TOP3_SHARE, TRADE_YEAR, WORLD_TRADE_MT, type SourceId,
} from "../../../../lib/lng/reference";
import { periodLabel, type CommodityExports } from "../../../../lib/commodity/absExports";

const LG = LNG_CSS;
const BUY = BUYER_CSS;

function SourceLink({ id }: { id: SourceId }) {
  return <RailSourceLink source={SOURCES[id]} accent={LG} />;
}

const totalCapacity = PLANTS.reduce((a, p) => a + p.mtpa, 0);
const capacityBy = (st: "WA" | "NT" | "Qld") => PLANTS.filter((p) => p.state === st).reduce((a, p) => a + p.mtpa, 0);

function HormuzBox({ focus }: { focus?: (id: string) => void }) {
  return <div className="mt-3 rounded-sm border border-[var(--line)] p-3">
    <Kicker>2026 · Strait of Hormuz · as of {HORMUZ.asOf}</Kicker>
    <dl className="mt-2 grid grid-cols-2 gap-2">
      <Stat label="Restricted since" value={HORMUZ.closedSince.replace(" 2026", "")} sub="2026" />
      <Stat label="LNG supply cut off" value={`~${pct(HORMUZ.supplyShare)}`} sub="of world supply" />
    </dl>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">{HORMUZ.summary} {HORMUZ.latest}</p>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">{HORMUZ.australia}</p>
    {focus ? <button type="button" onClick={() => focus("hormuz")} className="mt-2 text-[10px] underline" style={{ color: BUY }}>Show on the globe ↗</button> : null}
    <div className="flex flex-col">{HORMUZ.sources.map((id) => <SourceLink key={id} id={id} />)}</div>
  </div>;
}

type Tab = "plants" | "exporters" | "importers";

export default function LngIntelPanel({ narrow, selected, focus, close, exportsState }: RailApi & { exportsState: Loadable<CommodityExports> }) {
  const [tab, setTab] = useState<Tab>("plants");
  const colon = selected ? selected.indexOf(":") : -1;
  const kind = selected && colon > 0 ? selected.slice(0, colon) : null;
  const key = selected && colon > 0 ? selected.slice(colon + 1) : null;
  const live = exportsState.status === "ok" ? exportsState.data : null;

  const detail = (() => {
    if (!selected) return null;
    if (selected === "hormuz") return <>
      <Kicker>Chokepoint</Kicker>
      <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">Strait of Hormuz</h4>
      <HormuzBox />
      <button type="button" onClick={() => focus("x:qatar")} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">Qatar: {EXPORTERS.find((e) => e.id === "qatar")!.mt.toFixed(1)} Mt exported in {TRADE_YEAR} ↗</button>
    </>;
    if (kind === "plant") {
      const p = PLANTS.find((x) => x.id === key);
      if (!p) return null;
      return <>
        <Kicker>LNG plant · {p.state}</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{p.name}</h4>
        <p className="mt-1 text-[11px] text-[var(--ink-2)]">{p.operator} · since {p.startYear}</p>
        <Headline value={`${p.mtpa} Mtpa`} sub={`Nameplate capacity · ${pct(p.mtpa / totalCapacity)} of Australia's`} color={LG} />
        <dl className="mt-4 grid grid-cols-1 gap-3 border-y border-[var(--line)] py-3"><Stat label="Gas from" value={p.feed} /></dl>
        {p.note ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">{p.note}</p> : null}
        {p.state === "Qld" ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">The three Gladstone plants on Curtis Island run on coal seam gas and are linked to the east coast gas grid, so what they export affects gas supply and prices for households and industry in eastern Australia.</p> : null}
        <SourceLink id={p.source} />
      </>;
    }
    if (kind === "x") {
      const e = EXPORTERS.find((x) => x.id === key);
      if (!e) return null;
      const rank = EXPORTERS.indexOf(e) + 1;
      return <>
        <Kicker>Exporter · {TRADE_YEAR}</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{e.name}</h4>
        <Headline value={`${e.mt.toFixed(1)} Mt`} sub={`LNG exported ${TRADE_YEAR} · #${rank} · ${pct(e.mt / WORLD_TRADE_MT)} of world trade`} color={LG} />
        {e.note ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">{e.note}</p> : null}
        {e.id === "qatar" ? <HormuzBox focus={focus} /> : null}
        {e.id === "australia" ? <AustraliaBox live={live} /> : null}
        <SourceLink id="igu" />
      </>;
    }
    if (kind === "flow") {
      const dest = DESTINATIONS.find((x) => x.code === key);
      if (!dest) return null;
      const d = live?.destinations.find((x) => x.code === key);
      const imp = IMPORTERS.find((i) => i.name === dest.name);
      return <>
        <Kicker>Australian exports · LNG</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">Australia → {dest.name}</h4>
        {d ? <>
          <Headline value={audBn(d.last12AudM)} sub={`Last 12 months to ${periodLabel(live!.latestPeriod)} · ${pct(d.share)} of Australia's LNG exports`} color={LG} />
          <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3">
            <Stat label={periodLabel(live!.latestPeriod)} value={d.latestAudM !== null ? audBn(d.latestAudM) : "—"} />
            <Stat label="Share of total" value={pct(d.share)} />
          </dl>
        </> : <p className="mt-3 border-l-2 border-[var(--line)] pl-3 text-[11px] text-[var(--ink-3)]">{exportsState.status === "loading" ? "Loading ABS figures…" : "ABS figures unavailable just now."}</p>}
        {imp ? <button type="button" onClick={() => focus(imp.id)} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">{imp.name} imported {imp.mt.toFixed(1)} Mt from all suppliers in {TRADE_YEAR} ↗</button> : null}
        <p className="mt-3 text-[10px] text-[var(--ink-3)]">Arcs start at Karratha for clarity; LNG also ships from Onslow, Barrow Island, Prelude, Darwin and Gladstone.</p>
        <a href={SOURCES.abs.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] underline" style={{ color: LG }}>{SOURCES.abs.label} ↗</a>
      </>;
    }
    const imp = IMPORTERS.find((x) => x.id === selected);
    if (!imp) return null;
    const flow = DESTINATIONS.find((d) => d.name === imp.name);
    return <>
      <Kicker>Importer · {TRADE_YEAR}</Kicker>
      <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{imp.name}</h4>
      <Headline value={`${imp.mt.toFixed(1)} Mt`} sub={`LNG imported ${TRADE_YEAR} · ${pct(imp.mt / WORLD_TRADE_MT)} of world trade`} color={BUY} />
      {imp.note ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">{imp.note}</p> : null}
      {flow ? <button type="button" onClick={() => focus(`flow:${flow.code}`)} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">Australian LNG to {imp.name} ↗</button> : null}
      <SourceLink id="igu" />
    </>;
  })();

  const plantsRanked = [...PLANTS].sort((a, b) => b.mtpa - a.mtpa);

  return (
    <RailShell id="lng-intel-content" label="LNG intelligence" kicker="P·03 / LNG intelligence" title="Gas field → plant → ship"
      narrow={narrow} selectedKey={selected} onBack={close} backLabel="Back to LNG overview">
      {detail ? <section>{detail}</section> : <>
        <PriceBlock symbol="NYMEX:JKM1!" kicker="Price · JKM (Japan/Korea Marker) futures" label="JKM LNG futures (NYMEX:JKM1!), delayed" accent={LG} rgb="111,168,255"
          note="The Asian spot LNG benchmark, US dollars per MMBtu, delayed. Most Australian LNG is sold on long-term contracts linked to oil prices, so spot moves reach export earnings gradually." />

        <RailSection label="2026 shock">
          <HormuzBox focus={focus} />
        </RailSection>

        <RailSection label="Australian exports" kicker="Australia's LNG exports · ABS">
          <ExportsBlock state={exportsState} accent={LG} colors={[LG]} focus={focus} sourceUrl={SOURCES.abs.url} sourceLabel={SOURCES.abs.label}
            fallback={<p className="mt-2 text-[11px] text-[var(--ink-3)]">The Department of Industry puts Australia&apos;s LNG export earnings at A${OUTLOOK.points[0].audBn}bn in {OUTLOOK.points[0].year}.</p>}
            footnote="SITC 343 is natural gas in any form; Australia's exports of it are almost all LNG." />
        </RailSection>

        <RailSection label="World trade" kicker={`World trade · ${TRADE_YEAR}`}>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Stat label="LNG traded" value={`${WORLD_TRADE_MT} Mt`} sub="a record" />
            <Stat label="US, Qatar, Australia" value={pct(TOP3_SHARE)} sub="of exports" />
          </dl>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">In {TRADE_YEAR} the US stretched its lead and Qatar edged past Australia for second place. Europe was the fastest-growing buyer as it replaced Russian pipeline gas, while China and India bought less.</p>
          <SourceLink id="igu" />
        </RailSection>

        <RailSection label="Outlook" kicker="Outlook · Department of Industry">
          <dl className="mt-2 grid grid-cols-2 gap-2">{OUTLOOK.points.map((p) => <Stat key={p.year} label={p.year} value={`A$${p.audBn}bn`} />)}</dl>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">Forecast LNG export earnings. {OUTLOOK.note}</p>
          <SourceLink id="req" />
        </RailSection>

        <RailSection label="Australia"><AustraliaBox live={live} /></RailSection>

        <Explorer<Tab>
          tabs={[{ id: "plants", label: "australian plants" }, { id: "exporters", label: "exporters" }, { id: "importers", label: "importers" }]}
          current={tab} onTab={setTab} accentFor={(t) => (t === "importers" ? BUY : LG)}
          footnote={tab === "plants" ? `Nameplate capacity, Mtpa · ${totalCapacity.toFixed(1)} Mtpa in all` : `${TRADE_YEAR}, IGU`}>
          {tab === "plants" ? plantsRanked.map((p) => <li key={p.id}><button type="button" onClick={() => focus(`plant:${p.id}`)} className={rowBtn}><span><span className="block font-mono text-[10px] text-[var(--ink)]">{p.name}</span><span className="text-[9px] text-[var(--ink-3)]">{p.operator} · {p.state}</span></span><span className="font-mono text-[10px]" style={{ color: LG }}>{p.mtpa}</span></button></li>)
            : tab === "exporters" ? EXPORTERS.map((e, i) => <li key={e.id}><button type="button" onClick={() => focus(`x:${e.id}`)} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{String(i + 1).padStart(2, "0")} · {e.name}</span><span className="font-mono text-[10px]" style={{ color: LG }}>{e.mt.toFixed(1)} Mt</span></button></li>)
            : IMPORTERS.map((x) => <li key={x.id}><button type="button" onClick={() => focus(x.id)} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{x.name}</span><span className="font-mono text-[10px]" style={{ color: BUY }}>{x.mt.toFixed(1)} Mt</span></button></li>)}
        </Explorer>

        <CompanyList companies={COMPANIES} accent={LG} note="Companies with LNG exposure, not a recommendation." />

        <SourceList sources={Object.values(SOURCES)} note="Reference figures are updated by hand from the sources above; the Hormuz note is dated and checked weekly. Australia's export value comes live from the ABS. Plant positions are approximate." />
      </>}
    </RailShell>
  );
}

function AustraliaBox({ live }: { live: CommodityExports | null }) {
  const au = EXPORTERS.find((e) => e.id === "australia")!;
  return <div className="mt-3 rounded-sm border border-[var(--line)] p-3">
    <Kicker>Australia</Kicker>
    <dl className="mt-2 grid grid-cols-3 gap-2">
      <Stat label={`Exports ${TRADE_YEAR}`} value={`${Math.round(au.mt)} Mt`} sub={`#3, ${pct(au.mt / WORLD_TRADE_MT)}`} />
      <Stat label="Capacity" value={`${Math.round(totalCapacity)} Mtpa`} sub={`${PLANTS.length} plants`} />
      <Stat label="By state" value={`${pct(capacityBy("WA") / totalCapacity)} WA`} sub={`Qld ${pct(capacityBy("Qld") / totalCapacity)}, NT ${pct(capacityBy("NT") / totalCapacity)}`} />
    </dl>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
      Western Australia&apos;s plants run on offshore gas from the North West Shelf; Queensland&apos;s three run on coal seam gas; Darwin takes gas from the Timor Sea and Browse Basin. Pilbara Ports handled {PILBARA_LNG_MT} Mt of LNG in 2025-26.
      {live && live.states.length ? ` By export value over the last 12 months: ${live.states.filter((s) => s.share > 0).map((s) => `${s.name} ${pct(s.share)}`).join(", ")}.` : ""} New supply: Barossa restarted Darwin LNG in January 2026, and Pluto Train 2 is due to ship its first cargo in late 2026.
    </p>
    <SourceLink id="accr" />
    <SourceLink id="pilbaraPorts" />
  </div>;
}
