import type { Metadata } from "next";
import { createDb, getSignalLog, hitRates, callFor, addMonths, HORIZONS, SIGNALS, type LogRow, type Outcome } from "@a3ro/oil-backend";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";

/* Public track record (roadmap #11): every open-data call, logged the day it
   changed, scored 1, 3 and 6 months later by the market move it implied.
   Rules live in backend/src/trackRecord/scoring.ts; the page only reads. */

// Scores are written once a day by the macro cron.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Track record — A3RO Intelligence",
  description: "Every macro call we've made, logged the day it changed and scored 1, 3 and 6 months later against the market.",
};

const pct = (x: number, digits = 1) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
const dateFmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

async function loadLog(): Promise<LogRow[] | null> {
  try { return await getSignalLog(await createDb()); } catch { return null; }
}

function OutcomeCell({ row, horizon, months }: { row: LogRow; horizon: (typeof HORIZONS)[number]["key"]; months: number }) {
  const o: Outcome | undefined = row.outcomes[horizon];
  if (!o) return <td className="px-3 py-2 text-[var(--ink-3)]">due {dateFmt(addMonths(row.firedOn, months))}</td>;
  if ("noCall" in o) return <td className="px-3 py-2 text-[var(--ink-3)]">no call</td>;
  return <td className="px-3 py-2 font-mono">
    <span className={o.hit ? "text-[#5fc9a4]" : "text-[#e07a5f]"}>{o.hit ? "✓" : "✗"}</span> {pct(o.return)}
  </td>;
}

export default async function TrackRecordPage() {
  const log = await loadLog();
  const signals = Object.entries(SIGNALS);

  return <main className="relative min-h-screen">
    <Nav />
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 pb-20 pt-36 md:px-10">
      <header>
        <p className="landing-kicker">Track record</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Every call, scored in public</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">Each signal is logged on the day it changes, before anyone knows how it turns out. One, three and six months later it is scored against the market move it implied. Nothing is edited after the fact, and misses stay on the page.</p>
      </header>

      <section aria-labelledby="hit-rates">
        <h2 id="hit-rates" className="text-lg font-medium">Hit rates so far</h2>
        {log === null ? <p className="mt-3 text-sm text-[var(--ink-3)]">The record couldn&rsquo;t be loaded just now. Try again shortly.</p> :
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {signals.map(([id, meta]) => {
              const rows = log.filter((r) => r.signal === id);
              return <div key={id} className="rounded-sm border border-[var(--line-2)] p-4">
                <p className="text-sm font-medium">{meta.name}</p>
                <p className="mt-1 text-xs text-[var(--ink-3)]">Scored against {meta.benchmark} · {rows.length} call{rows.length === 1 ? "" : "s"} logged</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
                  {hitRates(rows).map((h) => <div key={h.horizon}>
                    <dt className="uppercase tracking-[0.15em] text-[var(--ink-3)]">{h.horizon}</dt>
                    <dd className="mt-1 text-base text-[var(--ink)]">{h.rate === null ? "—" : `${Math.round(h.rate * 100)}%`}</dd>
                    <dd className="text-[var(--ink-3)]">{h.scored ? `${h.hits}/${h.scored}` : "none yet"}</dd>
                  </div>)}
                </dl>
              </div>;
            })}
          </div>}
      </section>

      {log && <section aria-labelledby="calls">
        <h2 id="calls" className="text-lg font-medium">The calls</h2>
        {log.length === 0 ? <p className="mt-3 text-sm text-[var(--ink-3)]">No calls logged yet.</p> :
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                <tr><th className="px-3 py-2">Logged</th><th className="px-3 py-2">Signal</th><th className="px-3 py-2">Reading</th><th className="px-3 py-2">Call</th>
                  {HORIZONS.map((h) => <th key={h.key} className="px-3 py-2">{h.key}</th>)}</tr>
              </thead>
              <tbody>
                {log.map((r) => {
                  const call = callFor(r.signal, r.state);
                  return <tr key={r.id} className="border-t border-[var(--line-2)]">
                    <td className="px-3 py-2 whitespace-nowrap">{dateFmt(r.firedOn)}</td>
                    <td className="px-3 py-2">{SIGNALS[r.signal]?.name ?? r.signal}</td>
                    <td className="px-3 py-2 text-[var(--ink-2)]">{r.label}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{call?.direction ? `${call.benchmark} ${call.direction === "up" ? "↑" : "↓"}` : "no call"}</td>
                    {HORIZONS.map((h) => <OutcomeCell key={h.key} row={r} horizon={h.key} months={h.months} />)}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}
      </section>}

      <section aria-labelledby="rules" className="max-w-3xl text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 id="rules" className="text-lg font-medium text-[var(--ink)]">How calls are scored</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><strong>US economic regime</strong> against the S&amp;P 500: Goldilocks and Reflation call it up; Inflation and Deflation call it down.</li>
          <li><strong>Macro weather</strong> against the S&amp;P 500: Sunny and Partly cloudy call it up; Rain and Storm call it down.</li>
          <li><strong>Australia Pulse</strong> against the Australian dollar (AUD/USD): leading indicators improving calls it up, weakening calls it down, mixed is no call. We use the Aussie dollar because ASX index data isn&rsquo;t licensed for the site yet.</li>
          <li>Entry is the first daily close on or after the day the call was logged. Exit is the last close on or before the date 1, 3 or 6 months later. A hit means the price moved the called way; a flat close counts as a miss.</li>
          <li>Every call runs its full horizon, even if the signal changes in between. Scores are written once and never recalculated.</li>
          <li>Past calls don&rsquo;t predict future ones. This is general information, not financial advice.</li>
        </ul>
      </section>
    </div>
    <SiteFooter />
  </main>;
}
