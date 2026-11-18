"use client";
import { AUSTRALIA_REGISTRY, isAustraliaIndicator } from "../../../../backend/src/australia/registry";
import { DIRECTION_WINDOW, LEAD_SEARCH, STEADY_BAND, type Diffusion, type Pulse } from "../../../../backend/src/australia/pulse";
import { AU_ACCENT } from "./australiaWatchData";

const label = (id: string) => (isAustraliaIndicator(id) ? AUSTRALIA_REGISTRY[id].label : id);
const pct = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);

function count(d: Diffusion, up: string, down: string) {
  const counted = d.up + d.down + d.steady;
  return `${d.up} of ${counted} ${up}${d.down ? `, ${d.down} ${down}` : ""}${d.steady ? `, ${d.steady} steady` : ""}`;
}

/** 2×2: x = share of leading indicators improving, y = share of inflation series rising. */
function Quadrant({ pulse }: { pulse: Pulse }) {
  const gx = pulse.growth.share, iy = pulse.inflation.share;
  const placed = pulse.quadrant.growth !== null && pulse.quadrant.inflation !== null && gx !== null && iy !== null;
  const X = (v: number) => 30 + v * 200, Y = (v: number) => 210 - v * 200;
  return <svg viewBox="0 0 250 236" className="w-full max-w-[280px]" role="img"
    aria-label={placed ? `Leading indicators ${pct(gx)} improving; inflation series ${pct(iy)} rising` : "Not enough current readings to place the point"}>
    <rect x="30" y="10" width="200" height="200" fill="none" stroke="var(--line)" />
    <line x1="130" x2="130" y1="10" y2="210" stroke="var(--line)" strokeDasharray="3 4" />
    <line x1="30" x2="230" y1="110" y2="110" stroke="var(--line)" strokeDasharray="3 4" />
    {[["Weakening ·", "pressure building", 36, 26], ["Improving ·", "pressure building", 224, 26], ["Weakening ·", "pressure easing", 36, 190], ["Improving ·", "pressure easing", 224, 190]].map(([a, b, x, y]) =>
      <text key={`${a}${b}`} x={x as number} y={y as number} textAnchor={(x as number) > 130 ? "end" : "start"} fontSize="8" fill="var(--ink-3)"><tspan x={x as number}>{a}</tspan><tspan x={x as number} dy="10">{b}</tspan></text>)}
    <text x="130" y="230" textAnchor="middle" fontSize="8" fill="var(--ink-3)">leading indicators improving →</text>
    <text x="12" y="110" textAnchor="middle" fontSize="8" fill="var(--ink-3)" transform="rotate(-90 12 110)">inflation rising →</text>
    {placed && <circle cx={X(gx!)} cy={Y(iy!)} r="6" fill={AU_ACCENT} />}
  </svg>;
}

export default function PulseBand({ pulse }: { pulse: Pulse }) {
  const { growth, inflation, coverage } = pulse;
  const leadsShown = Object.entries(pulse.leads).filter(([, l]) => l);
  return <section aria-label="Australia Pulse" className="mt-8 rounded-md border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div><p className="font-mono text-[10px] uppercase tracking-[.3em]" style={{ color: AU_ACCENT }}>Australia Pulse</p>
        <h2 className="mt-2 text-xl font-medium text-[var(--ink)]">{pulse.quadrant.label}</h2></div>
      <p className="text-[11px] text-[var(--ink-3)]">Descriptive summary of the cards below · not a forecast</p>
    </div>
    <div className="mt-5 grid gap-6 md:grid-cols-[280px_1fr]">
      <Quadrant pulse={pulse} />
      <div className="space-y-4 text-sm">
        <div><p className="text-[var(--ink)]">Leading indicators: {count(growth, "improving", "weakening")}</p>
          <p className="text-xs text-[var(--ink-3)]">Change over the last {DIRECTION_WINDOW.monthly} months (monthly series) or quarter (quarterly series), signed so that “improving” means better for activity.</p></div>
        <div><p className="text-[var(--ink)]">Inflation series: {count(inflation, "rising", "easing")}</p>
          <p className="text-xs text-[var(--ink-3)]">Every primary card in the inflation section, over the same window.</p></div>
        <table className="w-full text-left text-xs"><thead className="text-[var(--ink-3)]"><tr><th className="py-1 font-normal">Section</th><th className="font-normal">Leading, improving</th><th className="font-normal">Rising · falling · steady</th></tr></thead>
          <tbody>{pulse.pillars.map((p) => <tr key={p.pillar} className="border-t border-[var(--line)]"><td className="py-1.5 text-[var(--ink-2)]">{p.label}</td>
            <td className="text-[var(--ink)]">{p.leadingGrowth.members.length ? `${p.leadingGrowth.up} of ${p.leadingGrowth.up + p.leadingGrowth.down + p.leadingGrowth.steady}` : "—"}</td>
            <td className="text-[var(--ink-2)]">{p.directions.rising} · {p.directions.falling} · {p.directions.steady}{p.directions.unavailable ? ` (${p.directions.unavailable} n/a)` : ""}</td></tr>)}</tbody></table>
      </div>
    </div>
    {pulse.moved.length > 0 && <div className="mt-5 border-t border-[var(--line)] pt-4"><p className="text-xs text-[var(--ink-3)]">What moved most against its own history in the latest period</p>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{pulse.moved.map((m) => <li key={m.indicator}><a className="underline decoration-[var(--line)] underline-offset-4 hover:decoration-current" href={`#au-${m.indicator}`}>{label(m.indicator)}</a>
        <span className="text-[var(--ink-2)]"> {m.zChange >= 0 ? "+" : ""}{m.zChange.toFixed(1)} sd · now {m.z >= 0 ? "+" : ""}{m.z.toFixed(1)} sd ({m.period})</span></li>)}</ul></div>}
    <p className="mt-4 text-[11px] text-[var(--ink-3)]">{coverage.withData} of {coverage.primary} series have data{coverage.stale.length ? ` · stale and not counted: ${coverage.stale.map(label).join(", ")}` : ""}{coverage.missing.length ? ` · awaiting data: ${coverage.missing.map(label).join(", ")}` : ""}.</p>
    <details className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]"><summary className="cursor-pointer">How this is calculated</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        <li>Each series is compared with its value {DIRECTION_WINDOW.monthly} months (or one quarter) earlier, using the same transform as its chart. Moves smaller than {STEADY_BAND.default} (or ${STEADY_BAND.aud_millions}m for A$ series) count as steady.</li>
        <li>“Improving” uses each series’ registry polarity: falling unemployment, spreads or rate expectations count as improving.</li>
        <li>The point sits at the share of improving leading indicators (across) and the share of rising inflation series (up), ignoring steady ones. An axis needs at least three counted series. There are no weights.</li>
        <li>“What moved” ranks the change in each series’ distance from its own 10-year average (standard deviations) between its last two observations. Series without enough history are left out.</li>
        <li>Stale series (behind their release schedule) are shown but not counted.</li>
        <li>Measured lead times: for monthly leading series, the lag between 0 and {LEAD_SEARCH.maxLagMonths} months at which the series best correlates with the later 12-month fall in unemployment, excluding Mar 2020–Dec 2021. Shown only where r ≥ {LEAD_SEARCH.minCorrelation} on at least {LEAD_SEARCH.minPairs} months. {leadsShown.length ? `Currently shown for ${leadsShown.length} series.` : "None currently meet that bar."} These describe the last decade and are not predictions.</li>
      </ul></details>
  </section>;
}
