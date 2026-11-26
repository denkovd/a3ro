"use client";

import { useEffect, useState } from "react";
import { countdown, sydneyLabel } from "../../../backend/src/execute/format";
import type { ExecuteEvent, ExecutePeekPayload } from "../../../backend/src/execute/types";

export const EXECUTE_ROUTE = "/Projects/Execute";
const ACCENT = "#d4a157";

/** Homepage card. Uses only the public calendar peek, so it is safe to show to everyone. */
export default function Execute({ className = "" }: { className?: string }) {
  const [events, setEvents] = useState<ExecuteEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let live = true;
    fetch("/api/execute-peek").then(r => (r.ok ? r.json() : Promise.reject())).then((b: ExecutePeekPayload) => { if (live) setEvents(b.upcoming); }).catch(() => { if (live) setFailed(true); });
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => { live = false; clearInterval(id); };
  }, []);
  const next = events?.find(e => Date.parse(e.eventTime) > now.getTime());
  const pending = failed ? "Unavailable" : events ? "None in 45 days" : "Checking calendar…";
  const tiles = [
    { label: "Next pivot", value: next?.kind ?? "—", note: next ? sydneyLabel(next.eventTime) : pending },
    { label: Date.parse(next?.armTime ?? "") <= now.getTime() ? "Armed · event in" : "Setup arms in", value: next ? countdown(Date.parse(next.armTime) <= now.getTime() ? next.eventTime : next.armTime, now) : "—", note: "24h before the release" },
  ];
  return <a href={EXECUTE_ROUTE} className={`group relative flex flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] ${className}`}>
    <div className="flex-1 p-6 md:p-7"><p className="font-mono text-[10px] uppercase tracking-[.3em] text-[var(--ink-2)]">Execute — <span style={{ color: ACCENT }}>Research tracker</span></p><h3 className="mt-4 text-2xl font-semibold text-[var(--ink)]">BTC event pivots</h3><p className="mt-3 text-[13px] leading-6 text-[var(--ink-2)]">BTC often runs hard into Fed decisions and CPI prints. One fixed rule set fades that move, and every trade is recorded.</p>
      <div className="mt-7 grid grid-cols-2 gap-3">{tiles.map(tile => <div key={tile.label} className="border border-[var(--line)] p-3"><p className="text-[10px] text-[var(--ink-2)]">{tile.label}</p><p className="mt-2 font-mono text-xl text-[var(--ink)]">{tile.value}</p><p className="mt-2 text-[10px] text-[var(--ink-2)]">{tile.note}</p></div>)}</div>
    </div><div className="flex justify-between gap-3 px-5 py-4 hairline-t"><span className="text-sm text-[var(--ink)]">Signal and track record · Premium</span><span className="font-mono text-[10px] text-[var(--ink-2)]">FOMC · CPI ↗</span></div>
  </a>;
}
