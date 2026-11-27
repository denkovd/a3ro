"use client";
/* Right rail for the Uranium Tracker globe: overview by default, detail when something is selected.
   Every figure comes from lib/uranium/fuelChain.ts and names its source. Prices via TradingView (delayed). */
import { useState } from "react";
import { CompanyList, Kicker, PriceBlock, RailShell, SourceLink as RailSourceLink, SourceList, Stat, n, pct, rowBtn } from "../commodity/RailKit";
import {
  AUSTRALIA,
  COMPANIES,
  CONVERSION_WORLD_T,
  ENRICHMENT_GROUP_TOTALS,
  MINE_SHARE_OF_DEMAND,
  MINES,
  MINING_COUNTRIES,
  MINING_YEAR,
  REACTORS_AS_AT,
  REACTOR_COUNTRIES,
  REACTOR_WORLD,
  SITES,
  SOURCES,
  STAGE_EXPLAINER,
  STAGE_LABEL,
  STAGE_UNIT,
  WORLD_MINE_OUTPUT_T,
  type SourceId,
  type Stage,
} from "../../../../lib/uranium/fuelChain";
import type { ReactorMode, Selection } from "../UraniumTrackerCore";

const URN = "#b8e278";
const DEM = "#96c8e6";

function SourceLink({ id }: { id: SourceId }) {
  return <RailSourceLink source={SOURCES[id]} accent={URN} />;
}

export default function UraniumIntelPanel({ narrow, selected, reactorMode, focus, closePanel }: {
  narrow: boolean;
  selected: Selection | null;
  reactorMode: ReactorMode;
  focus: (s: Selection) => void;
  closePanel: () => void;
}) {
  const [directory, setDirectory] = useState<"mining" | Stage | "reactors">("mining");
  const key = selected ? `${selected.type}:${selected.type === "country" ? selected.c.id : selected.type === "mine" ? selected.m.id : selected.type === "site" ? selected.s.id : selected.r.id}` : null;

  const worldMined = WORLD_MINE_OUTPUT_T[MINING_YEAR];
  const miningRanked = [...MINING_COUNTRIES].sort((a, b) => b.t2024 - a.t2024);
  const reactorsRanked = [...REACTOR_COUNTRIES].sort((a, b) => reactorMode === "pipeline" ? (b.construction + b.planned) - (a.construction + a.planned) : b.operable - a.operable);

  const detail = (() => {
    if (!selected) return null;
    if (selected.type === "country") {
      const c = selected.c;
      const mines = MINES.filter((m) => m.countryId === c.id);
      const reactors = REACTOR_COUNTRIES.find((r) => r.id === c.id);
      return <>
        <Kicker>Mining country · {MINING_YEAR}</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{c.name}</h4>
        <p className="mt-3 font-mono text-3xl tabular-nums" style={{ color: URN }}>{n(c.t2024)} tU</p>
        <p className="mt-1 text-[11px] text-[var(--ink-3)]">Mine production {MINING_YEAR}{c.estimate ? " · WNA estimate" : ""} · {pct(c.t2024 / worldMined)} of world output</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-3">
          <Stat label={`${MINING_YEAR - 1}`} value={`${n(c.t2023)} tU`} />
          <Stat label="Change" value={`${c.t2024 >= c.t2023 ? "+" : ""}${n(c.t2024 - c.t2023)} tU`} />
        </dl>
        {mines.length ? <div className="mt-3"><Kicker>Largest mines</Kicker><ul className="mt-1 divide-y divide-[var(--line)]">{mines.map((m) => <li key={m.id}><button type="button" onClick={() => focus({ type: "mine", m })} className={rowBtn}><span><span className="block text-[11px] text-[var(--ink)]">{m.name}</span><span className="text-[9px] text-[var(--ink-3)]">{m.owner} · {m.method}</span></span><span className="font-mono text-[10px]" style={{ color: URN }}>{m.t2024 ? `${n(m.t2024)} tU` : ""}</span></button></li>)}</ul></div> : null}
        {c.id === "kazakhstan" ? <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-3)]">Kazakh uranium is mined by in-situ leach across wide well fields, so these mines are listed here rather than pinned.</p> : null}
        {c.id === "australia" ? <AustraliaBox /> : null}
        {reactors ? <button type="button" onClick={() => focus({ type: "reactor", r: reactors })} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">{c.name} reactors: {reactors.operable} operable ↗</button> : null}
        <SourceLink id="wnaMining" />
      </>;
    }
    if (selected.type === "mine") {
      const m = selected.m;
      const country = MINING_COUNTRIES.find((c) => c.id === m.countryId);
      return <>
        <Kicker>Mine · {m.method}</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{m.name}</h4>
        <p className="mt-1 text-[11px] text-[var(--ink-2)]">{m.owner}</p>
        {m.t2024 ? <><p className="mt-3 font-mono text-3xl tabular-nums" style={{ color: URN }}>{n(m.t2024)} tU</p><p className="mt-1 text-[11px] text-[var(--ink-3)]">Production {MINING_YEAR} · {pct(m.t2024 / worldMined)} of world output</p></>
          : <p className="mt-3 border-l-2 border-[var(--line)] pl-3 text-[11px] text-[var(--ink-3)]">Operating mine. A separate {MINING_YEAR} figure is not published in our sources; it is included in the {country?.name} total.</p>}
        {m.method === "By-product (copper)" ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">Uranium is recovered alongside copper, so output follows the copper operation as much as the uranium price.</p> : null}
        {m.method === "In-situ leach" ? <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">In-situ leach pumps a solution through the ore underground and recovers uranium at the surface, without digging a pit.</p> : null}
        {country ? <button type="button" onClick={() => focus({ type: "country", c: country })} className="mt-3 block w-full rounded-sm border border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink-2)] hover:bg-[var(--depth-2)]">{country.name}: {n(country.t2024)} tU in {MINING_YEAR} ↗</button> : null}
        {m.countryId === "australia" ? <AustraliaBox /> : null}
        <SourceLink id={m.source} />
      </>;
    }
    if (selected.type === "site") {
      const s = selected.s;
      return <>
        <Kicker>{STAGE_LABEL[s.stage]} · {s.country}</Kicker>
        <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{s.name}</h4>
        <p className="mt-1 text-[11px] text-[var(--ink-2)]">{s.company}{s.status ? ` · ${s.status}` : ""}</p>
        {s.capacity !== null ? <><p className="mt-3 font-mono text-3xl tabular-nums" style={{ color: URN }}>{n(s.capacity)}</p><p className="mt-1 text-[11px] text-[var(--ink-3)]">{STAGE_UNIT[s.stage]}{s.estimate ? " · estimate" : ""}</p></>
          : <p className="mt-3 border-l-2 border-[var(--line)] pl-3 text-[11px] text-[var(--ink-3)]">{s.groupNote ?? "Capacity not published per site."}</p>}
        {s.capacity !== null && s.groupNote ? <p className="mt-2 text-[10px] text-[var(--ink-3)]">{s.groupNote}</p> : null}
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">{STAGE_EXPLAINER[s.stage]}</p>
        {s.stage === "conversion" && s.capacity ? <p className="mt-2 text-[10px] text-[var(--ink-3)]">About {pct(s.capacity / CONVERSION_WORLD_T)} of the world&apos;s roughly {n(CONVERSION_WORLD_T)} t U/yr licensed conversion capacity.</p> : null}
        <SourceLink id={s.source} />
      </>;
    }
    const r = selected.r;
    return <>
      <Kicker>Reactors · as at {REACTORS_AS_AT}</Kicker>
      <h4 className="mt-1 text-lg font-medium text-[var(--ink)]">{r.name}</h4>
      <p className="mt-3 font-mono text-3xl tabular-nums" style={{ color: DEM }}>{r.operable}</p>
      <p className="mt-1 text-[11px] text-[var(--ink-3)]">reactors operable · {(r.mwe / 1000).toFixed(1)} GWe</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-[var(--line)] py-3">
        <Stat label="Building" value={String(r.construction)} />
        <Stat label="Planned" value={String(r.planned)} />
        <Stat label="Proposed" value={String(r.proposed)} />
      </dl>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Uranium needed, 2025" value={`${n(r.uReq)} tU`} sub={`${pct(r.uReq / REACTOR_WORLD.uReq)} of world needs`} />
        {(() => { const mined = MINING_COUNTRIES.find((c) => c.id === r.id); return <Stat label={`Mined at home, ${MINING_YEAR}`} value={mined ? `${n(mined.t2024)} tU` : "None listed"} sub={mined ? (mined.t2024 >= r.uReq ? "Net exporter" : "Relies on imports") : "Relies on imports"} />; })()}
      </dl>
      <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">Operable counts reactors connected to the grid, including idle Japanese units. &ldquo;Planned&rdquo; means approved or funded, expected within about 15 years.</p>
      <SourceLink id="wnaReactors" />
    </>;
  })();

  return (
    <RailShell id="uranium-intel-content" label="Uranium intelligence" kicker="P·03 / Uranium intelligence" title="Mine → plant → reactor"
      narrow={narrow} selectedKey={key} onBack={closePanel} backLabel="Back to uranium overview">
        {detail ? <section>{detail}</section> : <>
          <PriceBlock symbol="TSX:U.UN" kicker="Price · Sprott Physical Uranium Trust" label="Sprott Physical Uranium Trust (TSX:U.UN) price, delayed" accent={URN} rgb="184,226,120"
            note="The trust holds physical uranium, so its unit price tracks spot. Delayed quote." />

          <section aria-label="Supply and demand" className="mt-3 border-b border-[var(--line)] pb-3">
            <Kicker>Supply vs demand</Kicker>
            <dl className="mt-2 grid grid-cols-2 gap-3">
              <Stat label={`Mined, ${MINING_YEAR}`} value={`${n(worldMined)} tU`} sub={`about ${pct(MINE_SHARE_OF_DEMAND[MINING_YEAR])} of reactor needs`} />
              <Stat label="Reactors need, 2025" value={`${n(REACTOR_WORLD.uReq)} tU`} sub={`${REACTOR_WORLD.operable} reactors · ${(REACTOR_WORLD.mwe / 1000).toFixed(0)} GWe`} />
            </dl>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">Mines have not covered reactor needs for years. The gap is filled from inventories and secondary supply. {REACTOR_WORLD.construction} reactors are being built and {REACTOR_WORLD.planned} more are planned.</p>
          </section>

          <section aria-label="Fuel chain" className="mt-3 border-b border-[var(--line)] pb-3">
            <Kicker>The fuel chain</Kicker>
            <ol className="mt-2 space-y-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
              <li><span className="text-[var(--ink)]">1 · Mining.</span> Ore becomes uranium oxide concentrate (yellowcake).</li>
              {(["conversion", "enrichment", "fabrication"] as Stage[]).map((st, i) => <li key={st}><span className="text-[var(--ink)]">{i + 2} · {STAGE_LABEL[st]}.</span> {STAGE_EXPLAINER[st]}</li>)}
              <li><span className="text-[var(--ink)]">5 · Reactors.</span> Fuel stays in a power reactor for about 3–6 years.</li>
            </ol>
            <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-3)]">Enrichment capacity by group · thousand SWU/yr</p>
            <ul className="mt-1">{ENRICHMENT_GROUP_TOTALS.map((g) => <li key={g.company} className="flex items-center justify-between py-0.5 text-[11px]"><span className="text-[var(--ink-2)]">{g.company} <span className="text-[9px] text-[var(--ink-3)]">{g.note}</span></span><span className="font-mono tabular-nums text-[var(--ink)]">{"estimate" in g && g.estimate ? "~" : ""}{n(g.kswu)}</span></li>)}</ul>
          </section>

          <section aria-label="Australia" className="mt-3 border-b border-[var(--line)] pb-3"><AustraliaBox /></section>

          <section aria-label="Explorer" className="mt-3 border-b border-[var(--line)] pb-3">
            <div role="group" aria-label="Category" className="flex flex-wrap gap-x-3">
              {(["mining", "conversion", "enrichment", "fabrication", "reactors"] as const).map((tab) => <button type="button" key={tab} aria-pressed={directory === tab} onClick={() => setDirectory(tab)} className="py-1 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: directory === tab ? (tab === "reactors" ? DEM : URN) : "var(--ink-3)" }}>{tab === "fabrication" ? "fuel" : tab}</button>)}
            </div>
            <ul className="mt-1 divide-y divide-[var(--line)]">
              {directory === "mining" ? miningRanked.map((c, i) => <li key={c.id}><button type="button" onClick={() => focus({ type: "country", c })} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{String(i + 1).padStart(2, "0")} · {c.name}</span><span className="font-mono text-[10px]" style={{ color: URN }}>{n(c.t2024)} tU</span></button></li>)
                : directory === "reactors" ? reactorsRanked.slice(0, 20).map((r) => <li key={r.id}><button type="button" onClick={() => focus({ type: "reactor", r })} className={rowBtn}><span className="font-mono text-[10px] text-[var(--ink)]">{r.name}</span><span className="font-mono text-[10px]" style={{ color: DEM }}>{reactorMode === "pipeline" ? `${r.construction + r.planned} coming` : `${r.operable} op.`}</span></button></li>)
                : SITES.filter((s) => s.stage === directory).map((s) => <li key={s.id}><button type="button" onClick={() => focus({ type: "site", s })} className={rowBtn}><span><span className="block font-mono text-[10px] text-[var(--ink)]">{s.name}</span><span className="text-[9px] text-[var(--ink-3)]">{s.company} · {s.country}</span></span><span className="font-mono text-[10px]" style={{ color: URN }}>{s.capacity !== null ? n(s.capacity) : "—"}</span></button></li>)}
            </ul>
            {directory !== "mining" && directory !== "reactors" ? <p className="mt-1 text-[9px] text-[var(--ink-3)]">{STAGE_UNIT[directory]}</p> : null}
            {directory === "reactors" ? <p className="mt-1 text-[9px] text-[var(--ink-3)]">Top 20 of {REACTOR_COUNTRIES.length} countries · as at {REACTORS_AS_AT}</p> : null}
          </section>

          <CompanyList companies={COMPANIES} accent={URN} note="A list of companies with uranium exposure, not a recommendation." />

          <SourceList sources={Object.values(SOURCES)} note="Reference data, updated by hand from the sources above, not live. Site positions are approximate." />
        </>}
    </RailShell>
  );
}

function AustraliaBox() {
  return <div className="mt-3 rounded-sm border border-[var(--line)] p-3">
    <Kicker>Australia</Kicker>
    <dl className="mt-2 grid grid-cols-3 gap-2">
      <Stat label="World resources" value={pct(AUSTRALIA.resourceShare)} sub="largest share" />
      <Stat label="Producer rank" value={`#${AUSTRALIA.productionRank2024}`} sub={`${MINING_YEAR}`} />
      <Stat label="World output" value={pct(AUSTRALIA.productionShare2024)} sub={`${MINING_YEAR}`} />
    </dl>
    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">{AUSTRALIA.largestDeposit} Operating mines: {AUSTRALIA.operatingMines.join(", ")}. Australia has no nuclear power reactors, so all its uranium is exported.</p>
    <SourceLink id={AUSTRALIA.source} />
  </div>;
}
