"use client";
import { useEffect, useMemo, useState } from "react";
import { REFINERIES, mergeRefineryEvents, type RefineryEvent } from "./refineries";

type EvidenceEvent = RefineryEvent & { refineryId: string };
export type RefineryFeed = { status: "loading" | "ready" | "error"; events: EvidenceEvent[]; checks: { source_id: string; last_attempted_at: string; last_success_at: string | null; status: string }[] };
export default function useRefineries() {
  const [feed, setFeed] = useState<RefineryFeed>({ status: "loading", events: [], checks: [] });
  useEffect(() => {
    let alive = true;
    let abort: AbortController | undefined;
    const refresh = async () => {
      abort?.abort();
      abort = new AbortController();
      const signal = abort.signal;
      try {
        const res = await fetch("/api/oil/refineries", { cache: "no-store", signal });
        const body = await res.json();
        if (!res.ok || !Array.isArray(body.events) || !Array.isArray(body.checks)) throw new Error("Unavailable");
        if (alive && !signal.aborted) setFeed({ status: "ready", events: body.events, checks: body.checks });
      } catch {
        if (alive && !signal.aborted) setFeed(prev => ({ ...prev, status: "error" }));
      }
    };
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 10 * 60_000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; abort?.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  const refineries = useMemo(() => REFINERIES.map(r => ({ ...r, events: mergeRefineryEvents(r, feed.events.filter(e => e.refineryId === r.id)) })), [feed.events]);
  return { refineries, feed };
}
