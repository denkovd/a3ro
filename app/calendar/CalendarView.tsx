"use client";
// One calendar (roadmap #24): confirmed Australian release times, central bank decisions and a
// global economic calendar. Earnings dates wait for licensed earnings data (#8).
import { useMemo } from "react";
import { AUSTRALIA_REGISTRY, isAustraliaIndicator } from "../../backend/src/australia/registry";
import { useAustraliaWatch } from "../components/projects/australia/australiaWatchData";
import TradingViewWidget from "../components/TradingViewWidget";
import { CENTRAL_BANK_SOURCES, upcomingMeetings } from "../../lib/centralBanks";

const SYDNEY = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const when = (iso: string) => SYDNEY.format(new Date(iso));

export interface UpcomingRelease { releaseAt: string; sourceUrl: string; titles: string[]; period: string }

/** Upcoming ABS/RBA releases, one row per publication (several indicators can share one release). */
export function groupReleases(schedules: Record<string, { sourceUrl: string; next: { releaseAt: string; referencePeriod: string } | null }>, now = new Date()): UpcomingRelease[] {
  const rows = new Map<string, UpcomingRelease>();
  for (const [indicator, schedule] of Object.entries(schedules)) {
    const next = schedule?.next;
    if (!next || new Date(next.releaseAt) < now) continue;
    const title = isAustraliaIndicator(indicator) ? AUSTRALIA_REGISTRY[indicator].label : indicator;
    const key = `${next.releaseAt}|${schedule.sourceUrl}`;
    const row = rows.get(key) ?? { releaseAt: next.releaseAt, sourceUrl: schedule.sourceUrl, titles: [], period: next.referencePeriod };
    if (!row.titles.includes(title)) row.titles.push(title);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.releaseAt.localeCompare(b.releaseAt));
}

export default function CalendarView() {
  const { releaseSchedules, status } = useAustraliaWatch();
  const releases = useMemo(() => groupReleases(releaseSchedules).slice(0, 12), [releaseSchedules]);
  const meetings = useMemo(() => upcomingMeetings(new Date(), 8), []);

  return <div className="mx-auto flex max-w-6xl flex-col gap-14 px-6 pb-20 pt-36 md:px-10">
    <header>
      <p className="landing-kicker">Calendar</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">What&rsquo;s coming up</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">Australian data releases, RBA and Fed decisions, and the global economic calendar in one place. Times are Sydney time.</p>
    </header>

    <div className="grid gap-10 lg:grid-cols-2">
      <section aria-labelledby="au-releases">
        <h2 id="au-releases" className="text-lg font-medium">Australian releases</h2>
        <p className="mt-1 text-xs text-[var(--ink-3)]">Confirmed times from the ABS release calendar. The series feed <a href="/Projects/Australia-Watch" className="underline">Australia Watch</a>.</p>
        {status === "loading" ? <p className="mt-6 text-sm text-[var(--ink-3)]">Loading…</p>
          : releases.length === 0 ? <p className="mt-6 text-sm text-[var(--ink-3)]">No confirmed release times right now.</p>
          : <ol className="mt-6 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {releases.map((r) => <li key={`${r.releaseAt}${r.sourceUrl}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
              <span className="w-44 shrink-0 font-mono text-xs text-[var(--ink-2)]">{when(r.releaseAt)}</span>
              <span className="text-sm">{r.titles.join(" · ")} <span className="text-[var(--ink-3)]">({r.period})</span>
                {" "}<a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--ink-3)] underline">source ↗</a></span>
            </li>)}
          </ol>}
      </section>

      <section aria-labelledby="cb-meetings">
        <h2 id="cb-meetings" className="text-lg font-medium">Central bank decisions</h2>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Announcement times. Sources: <a href={CENTRAL_BANK_SOURCES.RBA} target="_blank" rel="noreferrer" className="underline">RBA</a>, <a href={CENTRAL_BANK_SOURCES.Fed} target="_blank" rel="noreferrer" className="underline">Federal Reserve</a> (Fed dates are tentative until confirmed at the meeting before).
        </p>
        <ol className="mt-6 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {meetings.map((m) => <li key={`${m.bank}${m.label}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
            <span className="w-44 shrink-0 font-mono text-xs text-[var(--ink-2)]">{m.decisionAt ? when(m.decisionAt) : m.label}</span>
            <span className="text-sm"><span className="font-mono text-xs">{m.bank === "RBA" ? "RBA" : "US Fed"}</span> · meeting {m.label}{m.note ? <span className="text-[var(--ink-3)]"> · {m.note}</span> : null}</span>
          </li>)}
        </ol>
      </section>
    </div>

    <section aria-labelledby="global-calendar">
      <h2 id="global-calendar" className="text-lg font-medium">Global economic calendar</h2>
      <p className="mt-1 mb-4 text-xs text-[var(--ink-3)]">Medium and high importance events for Australia, the US, China, the euro area, Japan and the UK.</p>
      <TradingViewWidget widget="events" height={560} label="Economic calendar"
        config={{ importanceFilter: "0,1", countryFilter: "au,us,cn,eu,jp,gb" }} />
    </section>
  </div>;
}
