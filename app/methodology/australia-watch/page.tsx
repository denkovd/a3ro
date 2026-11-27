import type { Metadata } from "next";
import { MethodologyPage, Term } from "../content";
import { AUSTRALIA_INDICATORS, AUSTRALIA_REGISTRY, PILLAR_LABEL, PILLAR_ORDER, rbaTables, type AustraliaIndicatorDef } from "../../../backend/src/australia/registry";
import { DIRECTION_WINDOW, LEAD_SEARCH, STEADY_BAND } from "../../../backend/src/australia/pulse";

export const metadata: Metadata = {
  title: "Australia Watch methodology — A3RO Intelligence",
  description: "Where Australia Watch's data comes from (ABS, RBA, OECD), how each card is read, and the rules behind the Australia Pulse quadrant.",
  alternates: { canonical: "/methodology/australia-watch" },
};

function source(d: AustraliaIndicatorDef): string {
  if (d.source === "abs_sdmx") return `ABS (${d.dataflow.split(",")[1]})`;
  if (d.source === "rba_csv") return `RBA table ${rbaTables(d.rba).map((t) => t.toUpperCase()).join(", ")}`;
  if (d.source === "apra_xlsx") return "APRA (property exposures)";
  if (d.source === "aemo_csv") return "AEMO (NEM prices)";
  if (d.source === "asic_xlsx") return "ASIC (insolvency statistics)";
  return "OECD";
}
const ROLE = { leading: "Leading", coincident: "Coincident", lagging: "Lagging" } as const;

export default function AustraliaWatchMethodology() {
  const primary = AUSTRALIA_INDICATORS.filter((id) => AUSTRALIA_REGISTRY[id].section === "primary");
  const comparison = AUSTRALIA_INDICATORS.filter((id) => AUSTRALIA_REGISTRY[id].section === "comparison");
  return <MethodologyPage title="Australia Watch" updated="27 November 2026" moduleHref="/Projects/Australia-Watch" moduleLabel="Australia Watch">
    <p>Australia Watch tracks the Australian economy from official statistics: {primary.length} main series grouped by theme, each shown against its own history, plus the Australia Pulse, a summary of which way the readings are moving. It describes what the data says now. It doesn&rsquo;t forecast, and nothing on it is a recommendation.</p>

    <h2 id="sources">Where the data comes from</h2>
    <p>Everything is free, public data, fetched straight from the publisher every day: ABS and RBA series at 1:15pm Sydney time (after the ABS&rsquo;s 11:30am releases), OECD, APRA, AEMO and ASIC series by a separate job twice a day:</p>
    <ul>
      <li><strong>Australian Bureau of Statistics</strong> through its Data API: inflation, jobs, housing approvals, spending, trade, wages and national accounts.</li>
      <li><strong>Reserve Bank of Australia</strong> statistical tables: the cash rate, bond yields, credit growth, the Australian dollar and commodity prices.</li>
      <li><strong>OECD</strong>: composite leading indicators and confidence indexes.</li>
      <li><strong>APRA</strong> quarterly property exposures statistics: housing loans in arrears and non-performing.</li>
      <li><strong>AEMO</strong> National Electricity Market data: wholesale power prices.</li>
      <li><strong>ASIC</strong> insolvency statistics: companies entering administration, in total and by industry.</li>
    </ul>
    <p>When a source fails, the last stored figures stay on the page and the card says the refresh failed; nothing is filled in or guessed. Release dates come from the ABS release calendar where it publishes one, otherwise from each series&rsquo; usual delay.</p>

    <h2 id="series">The series</h2>
    <p>Each series has a role: <Term id="leading">leading</Term> series tend to turn before the economy does, <Term id="coincident">coincident</Term> series move with it, and <Term id="lagging">lagging</Term> series confirm a turn after it happens. Lead times shown on cards are typical ranges from the research literature unless the card says they were measured (see below).</p>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-xs">
        <thead><tr className="border-b border-[var(--line)] text-left text-[var(--ink-3)]"><th className="py-2 pr-3 font-normal">Series</th><th className="py-2 pr-3 font-normal">Role</th><th className="py-2 pr-3 font-normal">How often</th><th className="py-2 pr-3 font-normal">Figure</th><th className="py-2 font-normal">Source</th></tr></thead>
        {PILLAR_ORDER.map((pillar) => {
          const ids = primary.filter((id) => AUSTRALIA_REGISTRY[id].pillar === pillar);
          if (!ids.length) return null;
          return <tbody key={pillar}>
            <tr><td colSpan={5} className="pb-1 pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{PILLAR_LABEL[pillar]}</td></tr>
            {ids.map((id) => { const d: AustraliaIndicatorDef = AUSTRALIA_REGISTRY[id]; return <tr key={id} className="border-b border-[var(--line)] align-top">
              <td className="py-1.5 pr-3 text-[var(--ink)]">{d.label}</td>
              <td className="py-1.5 pr-3">{ROLE[d.role]}</td>
              <td className="py-1.5 pr-3 capitalize">{d.frequency}</td>
              <td className="py-1.5 pr-3">{d.transform === "yoy_from_level" ? "Annual change (ours)" : "As published"}</td>
              <td className="py-1.5">{source(d)}</td>
            </tr>; })}
          </tbody>;
        })}
      </table>
    </div>
    {comparison.length ? <p className="text-xs text-[var(--ink-3)]">Lower on the page, for comparison only and left out of every summary: {comparison.map((id) => AUSTRALIA_REGISTRY[id].label).join(", ")}.</p> : null}

    <h2 id="cards">How to read a card</h2>
    <ul>
      <li><strong>The headline figure</strong> is the latest published value. &ldquo;As published&rdquo; series are shown in the publisher&rsquo;s own terms (inflation is already an annual rate, for example). For &ldquo;annual change (ours)&rdquo; series we compare each period with the same period a year earlier.</li>
      <li><strong>Against its history.</strong> Each card compares the latest value with the series&rsquo; own previous 10 years: the average, and how far today sits from it as a <Term id="z-score">z-score</Term>. The comparison is withheld until there is enough history (usually 5 years of monthly data, or 36 months for the new Monthly CPI), so a young series never looks unusual by accident.</li>
      <li><strong>Direction</strong> compares the latest value with the previous period. Moves under 0.05 in the series&rsquo; own unit count as broadly steady.</li>
      <li><strong>Stale</strong> means the next release is overdue by its usual schedule. Stale series are still shown, but left out of the Pulse.</li>
      <li><strong>Revisions.</strong> Publishers revise recent figures. The page uses the latest version and records the change.</li>
    </ul>

    <h2 id="pulse">The Australia Pulse</h2>
    <p>The Pulse summarises which way the main series are moving. It has no weights and no forecasts, and every figure can be worked out by hand from the cards.</p>
    <ol>
      <li><strong>Direction of each series:</strong> its value now against {DIRECTION_WINDOW.monthly} months earlier for monthly series, or {DIRECTION_WINDOW.quarterly} quarter earlier for quarterly series. Changes smaller than {STEADY_BAND.default} in the series&rsquo; unit (A${STEADY_BAND.aud_millions} million for dollar series) count as steady.</li>
      <li><strong>Growth score (across):</strong> of the leading series that say something about growth, the share that are improving. &ldquo;Improving&rdquo; follows each series&rsquo; meaning: falling unemployment and narrowing credit spreads count as improving.</li>
      <li><strong>Price-pressure score (up):</strong> of the inflation series, the share that are rising.</li>
      <li><strong>The quadrant</strong> plots those two shares, ignoring steady series. Each axis needs at least three moving series; exactly half is shown as mixed. The labels describe the readings (for example &ldquo;leading indicators weakening, price pressure building&rdquo;) and don&rsquo;t predict what comes next.</li>
      <li><strong>The trail</strong> shows where the Pulse sat in each of the last five months, recomputed with the same rules using the data up to that month.</li>
      <li><strong>What moved:</strong> the five series whose z-score changed most between their last two releases.</li>
    </ol>
    <h3 id="measured-leads">Measured lead times</h3>
    <p>For monthly leading series, we test how many months ahead (0 to {LEAD_SEARCH.maxLagMonths}) each one has best matched the later 12-month change in unemployment. A measured lead replaces the typical range only when the match is reasonably strong (correlation {LEAD_SEARCH.minCorrelation} or more) over at least {LEAD_SEARCH.minPairs} months. March 2020 to December 2021 is left out, because COVID swamped every relationship. Picking the best of {LEAD_SEARCH.maxLagMonths + 1} possible lags flatters the result a little, so treat measured leads as a description of the past, not a model.</p>

    <h2 id="limits">What it can&rsquo;t tell you</h2>
    <ul>
      <li>Official data arrives weeks or months after the period it covers, so the page shows where the economy was, not where it is today.</li>
      <li>Leading indicators often give false signals. A Pulse reading is a summary of directions, not a recession probability.</li>
      <li>Some series are short (Monthly CPI starts in 2024), so their history comparisons start later.</li>
    </ul>
  </MethodologyPage>;
}
