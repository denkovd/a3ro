"use client";
/* Right rail for the Copper Tracker: overview by default, detail when something is selected.
   Built from the shared Commodity Watch rail kit. Live: COMEX warehouse stocks (CME) and
   Australia's copper exports (ABS). Everything else is reference data from lib/copper/reference.ts. */
import { useState } from "react";
import Link from "next/link";
import {
  CompanyList, Explorer, Headline, Kicker, MonthlyPriceBlock, useMonthlyPrice, ExportImpactBlock, RailSection, RailShell, SourceLink as RailSourceLink, SourceList, Stat, n, pct, rowBtn,
} from "../commodity/RailKit";
import ExportsBlock, { audBn, type Loadable } from "../commodity/ExportsBlock";
import type { RailApi } from "../commodity/CommodityGlobe";
import { COPPER_CSS, CU_REFINED_CSS, DEMAND_CSS } from "../copperTrackerShared";
import {
  COMPANIES, COUNTRIES, DEMAND, DESTINATIONS, PRODUCTION_YEAR, REQ_OUTLOOK, RESERVES, SITES, SOURCES, US_STOCKS,
  WORLD_MINE_KT, WORLD_REFINED_KT, type SourceId,
} from "../../../../lib/copper/reference";
import { periodLabel, type CommodityExports } from "../../../../lib/commodity/absExports";
import { COPPER_IMPACT, EXPORT_IMPACT_REVIEWED } from "../../../../lib/commodity/exportImpact";
import { SHORT_TON_TONNES } from "../../../../lib/copper/units";
import type { ComexCopperStocks } from "../../../../lib/copper/comexStocks";

const CU = COPPER_CSS;
const DEM = DEMAND_CSS;
const kt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} Mt` : `${n(Math.round(v))} kt`);

function SourceLink({ id }: { id: SourceId }) {
  return <RailSourceLink source={SOURCES[id]} accent={CU} />;
}

const dateLabel = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

function ComexBlock({ state }: { state: Loadable<ComexCopperStocks> }) {
  if (state.status === "loading") return <p className="mt-2 text-[11px] text-[var(--ink-3)]">Loading CME report…</p>;
  if (state.status === "error") return <p className="mt-2 border-l-2 border-[var(--line)] pl-3 text-[11px] text-[var(--ink-3)]">The CME report could not be read just now.</p>;
  const s = state.data;
  const t = (st: number) => Math.round((st * SHORT_TON_TONNES) / 1000);
  const change = s.prevTotal !== null ? s.total - s.prevTotal : null;
  return <>
    <dl className="mt-2 grid grid-cols-3 gap-2">
      <Stat label="Total" value={`${n(t(s.total))} kt`} sub={change !== null ? `${change >= 0 ? "+" : ""}${n(Math.round(change * SHORT_TON_TONNES))} t on the day` : undefined} />
      <Stat label="Registered" value={`${n(t(s.registered))} kt`} sub={pct(s.registered / s.total)} />
      <Stat label="Eligible" value={`${n(t(s.eligible))} kt`} sub={pct(s.eligible / s.total)} />
    </dl>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">Copper in COMEX-approved US warehouses. Registered metal is on warrant and can be delivered against futures; eligible metal meets the standard but is not. Report of {dateLabel(s.reportDate)}; converted from short tons.</p>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">The threat of US tariffs on copper in 2025 pulled metal into the US: USGS estimates US refined stocks reached {US_STOCKS.yearEndKt2025} kt at the end of 2025, up from {US_STOCKS.yearEndKt2024} kt a year earlier, and refined imports almost doubled.</p>
    <a href={SOURCES.cme.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] underline" style={{ color: CU }}>{SOURCES.cme.label} ↗</a>
  </>;
}

type Tab = "mining" | "refining" | "sites";

export default function CopperIntelPanel({ narrow, selected, focus, close, exportsState, comexState }: RailApi & { exportsState: Loadable<CommodityExports>; comexState: Loadable<ComexCopperStocks> }) {
  const price = useMonthlyPrice("copper");
  const [tab, setTab] = useState<Tab>("mining");
  const colon = selected ? selected.indexOf(":") : -1;
  const kind = selected && colon > 0 ? selected.slice(0, colon) : null;
  const key = selected && colon > 0 ? selected.slice(colon + 1) : null;
  const live = exportsState.status === "ok" ? exportsState.data : null;

  const detail = (() => {
    if (!selected) return null;
    if (kind === "m" || kind === "r") {
      const c = COUNTRIES.find((x) => x.id === key);
      if (!c) return null;
      const sites = SITES.filter((s) => s.country === c.id);
      const mining = kind === "m";
      const v = mining ? c.mine2025 : c.refined2025, prev = mining ? c.mine2024 : c.refined2024;
      return <>
        <Kicker>{mining ? "Mine output" : "Refined output"} · {PRODUCTION_YEAR}</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{c.name}</h4>
        <Headline value={kt(v ?? 0)} sub={`${mining ? "Copper mined" : "Refined copper"} ${PRODUCTION_YEAR} (USGS estimate) · ${pct((v ?? 0) / (mining ? WORLD_MINE_KT : WORLD_REFINED_KT))} of world`} color={mining ? CU : DEM} />
        <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3">
          <Stat label={`${PRODUCTION_YEAR - 1}`} value={prev !== null ? kt(prev) : "—"} />
          <Stat label="Change" value={v !== null && prev !== null ? `${v >= prev ? "+" : ""}${n(v - prev)} kt` : "—"} />
          <Stat label="Mined" value={c.mine2025 ? kt(c.mine2025) : "None"} />
          <Stat label="Refined" value={c.refined2025 ? kt(c.refined2025) : "None"} />
        </dl>
        {c.id === "china" ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">China refines about half the world&apos;s copper but mines only a fraction of what it refines, so it imports concentrate from Chile, Peru, Australia and elsewhere, and it uses about {pct(DEMAND.chinaShare)} of the world&apos;s refined copper.</p> : null}
        {c.id === "drc" ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">Most of Congo&apos;s copper is turned into metal at the mines (by leaching and electrowinning) and shipped as cathode.</p> : null}
        {c.id === "australia" ? <AustraliaBox live={live} /> : null}
        {sites.length ? <div className="mt-3"><Kicker>On the globe</Kicker><ul className="mt-1 divide-y divide-[var(--line)]">{sites.map((s) => <li key={s.id}><button type="button" onClick={() => focus(`site:${s.id}`)} className={rowBtn}><span className="text-[11px] text-[var(--ink)]">{s.name}</span><span className="text-[9px] text-[var(--ink-3)]">{s.owner}</span></button></li>)}</ul></div> : null}
        <button type="button" onClick={() => focus(`${mining ? "r" : "m"}:${c.id}`)} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">{mining ? "Refined output" : "Mine output"} for {c.name} ↗</button>
        <SourceLink id="usgs" />
      </>;
    }
    if (kind === "site") {
      const s = SITES.find((x) => x.id === key);
      if (!s) return null;
      const country = COUNTRIES.find((c) => c.id === s.country);
      return <>
        <Kicker>{s.kind === "smelter" ? "Smelter / refinery" : "Mine"}</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{s.name}</h4>
        <p className="mt-1 text-[11px] text-[var(--ink-2)]">{s.owner}</p>
        {s.note ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">{s.note}</p> : null}
        {country?.mine2025 ? <button type="button" onClick={() => focus(`m:${country.id}`)} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">{country.name}: {kt(country.mine2025)} mined in {PRODUCTION_YEAR} ↗</button> : null}
        <p className="mt-3 text-[10px] text-[var(--ink-3)]">Mine-level output is not shown; it is counted in the country totals. Position is approximate.</p>
        {s.source ? <SourceLink id={s.source} /> : null}
      </>;
    }
    if (kind === "flow") {
      const dest = DESTINATIONS.find((x) => x.code === key);
      if (!dest) return null;
      const d = live?.destinations.find((x) => x.code === key);
      return <>
        <Kicker>Australian exports · copper</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">Australia → {dest.name}</h4>
        {d ? <>
          <Headline value={audBn(d.last12AudM)} sub={`Last 12 months to ${periodLabel(live!.latestPeriod)} · ${pct(d.share)} of Australia's copper exports`} color={CU} />
          <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3">
            <Stat label={periodLabel(live!.latestPeriod)} value={d.latestAudM !== null ? audBn(d.latestAudM) : "—"} />
            <Stat label="Share of total" value={pct(d.share)} />
          </dl>
        </> : <p className="mt-3 border-l-2 border-[var(--line)] pl-3 text-[11px] text-[var(--ink-3)]">{exportsState.status === "loading" ? "Loading ABS figures…" : "ABS figures unavailable just now."}</p>}
        {key === "USA" ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">Refined copper shipments to the US jumped in August and September 2026. In most months the US takes little Australian copper.</p> : null}
        {key === "CHIN" || key === "JAP" || key === "INIA" ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">Mostly concentrate, sent to smelters there to be turned into metal.</p> : null}
        <p className="mt-3 text-[10px] text-[var(--ink-3)]">Ores, concentrates and refined copper together. Arcs start at Port Adelaide for clarity; Queensland copper ships from Townsville and NSW concentrate from Port Kembla.</p>
        <a href={SOURCES.abs.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] underline" style={{ color: CU }}>{SOURCES.abs.label} ↗</a>
      </>;
    }
    return null;
  })();

  const miningRanked = [...COUNTRIES].filter((c) => (c.mine2025 ?? 0) > 50).sort((a, b) => (b.mine2025 ?? 0) - (a.mine2025 ?? 0));
  const refiningRanked = [...COUNTRIES].filter((c) => (c.refined2025 ?? 0) > 0).sort((a, b) => (b.refined2025 ?? 0) - (a.refined2025 ?? 0));
  const china = COUNTRIES.find((c) => c.id === "china")!;
  const top3 = miningRanked.slice(0, 3);

  return (
    <RailShell id="copper-intel-content" label="Copper intelligence" kicker="P·03 / Copper intelligence" title="Mine → smelter → wire"
      narrow={narrow} selectedKey={selected} onBack={close} backLabel="Back to copper overview">
      {detail ? <section>{detail}</section> : <>
        <MonthlyPriceBlock data={price} kicker="Price · copper, LME monthly average" accent={CU} per="a tonne" decimals={0}
          note={`The world benchmark, in US dollars a tonne. USGS puts the 2025 COMEX average at a record US$${US_STOCKS.comexPriceUsdLb2025.toFixed(2)}/lb, up from US$${US_STOCKS.comexPriceUsdLb2024.toFixed(2)} in 2024.`} />
        <ExportImpactBlock impact={COPPER_IMPACT} price={price && price !== "error" ? price.summary?.latest.value ?? null : null} decimals={0} reviewed={EXPORT_IMPACT_REVIEWED} />

        <RailSection label="COMEX warehouse stocks" kicker="COMEX warehouse stocks · CME, daily">
          <ComexBlock state={comexState} />
        </RailSection>

        <RailSection label="Australian exports" kicker="Australia's copper exports · ABS">
          <ExportsBlock state={exportsState} accent={CU} colors={[CU, CU_REFINED_CSS]} focus={focus} sourceUrl={SOURCES.abs.url} sourceLabel={SOURCES.abs.label}
            fallback={<p className="mt-2 text-[11px] text-[var(--ink-3)]">The Department of Industry puts Australia&apos;s copper export earnings at about A${REQ_OUTLOOK.points[0].audBn}bn in {REQ_OUTLOOK.points[0].year}.</p>}
            footnote="Ores and concentrates go to smelters in Asia; refined copper mostly comes from Olympic Dam and Townsville." />
        </RailSection>

        <RailSection label="Supply and demand" kicker={`Supply vs demand · ${PRODUCTION_YEAR}`}>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Stat label="Mined worldwide" value={kt(WORLD_MINE_KT)} sub={`${top3.map((c) => c.name).join(", ")}: ${pct(top3.reduce((a, c) => a + (c.mine2025 ?? 0), 0) / WORLD_MINE_KT)}`} />
            <Stat label="Refined worldwide" value={kt(WORLD_REFINED_KT)} sub={`China ${pct((china.refined2025 ?? 0) / WORLD_REFINED_KT)}, incl. recycled`} />
          </dl>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">The world used {DEMAND.worldRefinedUsageMt} Mt of refined copper in {DEMAND.year}, about {pct(DEMAND.chinaShare)} of it in China. Mines are in the Andes and Central Africa; smelters are mostly in China, so most copper crosses an ocean as concentrate before it becomes metal. Refined output is larger than mine output because scrap is recycled.</p>
          <SourceLink id="icsg" />
        </RailSection>

        <RailSection label="Disruptions" kicker="Supply disruptions">
          <ul className="mt-1 divide-y divide-[var(--line)]">
            {SITES.filter((s) => s.disruption).map((s) => { const id = s.id; return <li key={id}><button type="button" onClick={() => focus(`site:${id}`)} className={rowBtn}>
              <span><span className="block text-[11px] text-[var(--ink)]">{s.name}</span><span className="text-[9px] text-[var(--ink-3)]">{s.disruption!.summary}</span></span>
              <span className="font-mono text-[10px]" style={{ color: CU }}>↗</span></button></li>; })}
          </ul>
        </RailSection>

        <RailSection label="Outlook" kicker="Outlook · Department of Industry">
          <dl className="mt-2 grid grid-cols-2 gap-2">{REQ_OUTLOOK.points.map((p) => <Stat key={p.year} label={p.year} value={`A$${p.audBn}bn`} />)}</dl>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">Forecast copper export earnings in real terms. {REQ_OUTLOOK.note} How much of that demand AI data centres add is tracked on <Link href="/Projects/AI-Dividend" className="underline" style={{ color: CU }}>AI Dividend</Link>.</p>
          <SourceLink id="req" />
        </RailSection>

        <RailSection label="Australia"><AustraliaBox live={live} /></RailSection>

        <Explorer<Tab>
          tabs={[{ id: "mining", label: "mining" }, { id: "refining", label: "refining" }, { id: "sites", label: "mines & plants" }]}
          current={tab} onTab={setTab} accentFor={(t) => (t === "refining" ? DEM : CU)}
          footnote={tab === "sites" ? "Positions approximate" : `Copper content, ${PRODUCTION_YEAR}, USGS estimates`}>
          {tab === "mining" ? miningRanked.map((c, i) => <li key={c.id}><button type="button" onClick={() => focus(`m:${c.id}`)} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{String(i + 1).padStart(2, "0")} · {c.name}</span><span className="font-mono text-[10px]" style={{ color: CU }}>{kt(c.mine2025 ?? 0)}</span></button></li>)
            : tab === "refining" ? refiningRanked.map((c, i) => <li key={c.id}><button type="button" onClick={() => focus(`r:${c.id}`)} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{String(i + 1).padStart(2, "0")} · {c.name}</span><span className="font-mono text-[10px]" style={{ color: DEM }}>{kt(c.refined2025 ?? 0)}</span></button></li>)
            : SITES.map((s) => <li key={s.id}><button type="button" onClick={() => focus(`site:${s.id}`)} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{s.name}</span><span className="text-[9px] text-[var(--ink-3)]">{s.owner}</span></button></li>)}
        </Explorer>

        <CompanyList companies={COMPANIES} accent={CU} note="Companies with copper exposure, not a recommendation." />

        <SourceList sources={Object.values(SOURCES)} note="Reference figures are updated by hand from the sources above; Australia's export value (ABS) and COMEX stocks (CME) are read live. Positions are approximate." />
      </>}
    </RailShell>
  );
}

function AustraliaBox({ live }: { live: CommodityExports | null }) {
  const au = COUNTRIES.find((c) => c.id === "australia")!;
  const rank = [...COUNTRIES].sort((a, b) => (b.mine2025 ?? 0) - (a.mine2025 ?? 0)).findIndex((c) => c.id === "australia") + 1;
  return <div className="mt-3 rounded-sm border border-[var(--line)] p-3">
    <Kicker>Australia</Kicker>
    <dl className="mt-2 grid grid-cols-3 gap-2">
      <Stat label="Reserves" value={pct(RESERVES.australiaKt / RESERVES.worldKt)} sub="of world" />
      <Stat label="Mine output" value={kt(au.mine2025 ?? 0)} sub={`#${rank}, ${PRODUCTION_YEAR}`} />
      <Stat label="Refined" value={kt(au.refined2025 ?? 0)} sub={`${PRODUCTION_YEAR}`} />
    </dl>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
      Australia holds about a tenth of the world&apos;s copper reserves ({n(RESERVES.australiaJorcKt)} kt of them JORC-compliant) but mines only about {pct((au.mine2025 ?? 0) / WORLD_MINE_KT)} of the world&apos;s copper, and most leaves as concentrate.
      {live && live.states[0] ? ` ${live.states[0].name} ships the most (${pct(live.states[0].share)} of export value over the last 12 months), led by Olympic Dam.` : ""} Copper metal is made in two places: Olympic Dam, and Glencore&apos;s Mount Isa smelter with its Townsville refinery.
    </p>
    <SourceLink id="usgs" />
  </div>;
}
