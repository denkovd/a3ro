"use client";
/* ────────────────────────────────────────────────────────────────
   Oil Tracker — live data hook
   Polls /api/oil/latest, /api/oil/series, and /api/oil/corridors and
   exposes a single stale-while-error snapshot to the client-only Oil
   Tracker view.

   Only TYPE imports come from "@a3ro/oil-backend": that package's
   index also re-exports pg-backed modules (createDb, etc.), so a
   VALUE import (e.g. importing BENCHMARKS) would drag `pg` into the
   client bundle. TRACKED below is a local, bundle-safe mirror of the
   backend's benchmark list.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import type { Benchmark, CorridorMetricLatest, DailyPrice, LatestQuote } from "@a3ro/oil-backend";

/** Local mirror of the backend's BENCHMARKS — see bundle-safety note above. */
const TRACKED = ["WTI", "BRENT"] as const satisfies readonly Benchmark[];

const DEFAULT_POLL_MS = 60_000;
const DEFAULT_SERIES_DAYS = 30;
const SLOW_CYCLE_REFRESH_MS = 60 * 60 * 1000; // 60 minutes

export type OilFeedStatus = "loading" | "ready" | "error";

export interface OilData {
  /** null until the first successful /latest fetch. */
  quotes: LatestQuote[] | null;
  series: Partial<Record<Benchmark, DailyPrice[]>>;
  /** null until the first successful /corridors fetch. */
  corridors: CorridorMetricLatest[] | null;
  /** "error" ONLY if we have never received quotes. Corridors never affect this. */
  status: OilFeedStatus;
  /** Date.now() of the last successful /latest fetch. */
  lastFetchedAt: number | null;
}

function todayUtcMinusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchLatest(signal: AbortSignal): Promise<LatestQuote[] | null> {
  const res = await fetch("/api/oil/latest", { cache: "no-store", signal });
  if (!res.ok) return null;
  const json: unknown = await res.json();
  if (!Array.isArray(json)) return null;
  return json as LatestQuote[];
}

async function fetchSeries(
  benchmark: Benchmark,
  seriesDays: number,
  signal: AbortSignal
): Promise<DailyPrice[] | null> {
  const from = todayUtcMinusDays(seriesDays);
  const to = todayUtc();
  const url = `/api/oil/series?benchmark=${benchmark}&from=${from}&to=${to}`;
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) return null;
  const json: unknown = await res.json();
  if (!Array.isArray(json)) return null;
  return json as DailyPrice[];
}

async function fetchCorridors(signal: AbortSignal): Promise<CorridorMetricLatest[] | null> {
  const res = await fetch("/api/oil/corridors", { cache: "no-store", signal });
  if (!res.ok) return null;
  const json: unknown = await res.json();
  if (!Array.isArray(json)) return null;
  return json as CorridorMetricLatest[];
}

export default function useOilData(opts?: { pollMs?: number; seriesDays?: number }): OilData {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS;
  const seriesDays = opts?.seriesDays ?? DEFAULT_SERIES_DAYS;

  const [quotes, setQuotes] = useState<LatestQuote[] | null>(null);
  const [series, setSeries] = useState<Partial<Record<Benchmark, DailyPrice[]>>>({});
  const [corridors, setCorridors] = useState<CorridorMetricLatest[] | null>(null);
  const [status, setStatus] = useState<OilFeedStatus>("loading");
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  /* mutable mirrors read inside async callbacks/timers, avoiding stale closures */
  const mountedRef = useRef(true);
  const pollMsRef = useRef(pollMs);
  const seriesDaysRef = useRef(seriesDays);
  const lastFetchedAtRef = useRef<number | null>(null);
  const hasQuotesRef = useRef(false);
  pollMsRef.current = pollMs;
  seriesDaysRef.current = seriesDays;

  useEffect(() => {
    mountedRef.current = true;

    let latestTimer: ReturnType<typeof setInterval> | null = null;
    let slowTimer: ReturnType<typeof setInterval> | null = null;
    /* every in-flight cycle (latest or slow) registers its controller here
       so unmount can abort all of them, per-cycle, in one place. */
    const inFlight = new Set<AbortController>();
    let latestAbort: AbortController | null = null;

    const runLatestCycle = async () => {
      latestAbort?.abort();
      const ac = new AbortController();
      latestAbort = ac;
      inFlight.add(ac);
      try {
        const result = await fetchLatest(ac.signal);
        if (!mountedRef.current || ac.signal.aborted) return;
        if (result !== null) {
          setQuotes(result);
          hasQuotesRef.current = true;
          const now = Date.now();
          lastFetchedAtRef.current = now;
          setLastFetchedAt(now);
          setStatus("ready");
        } else {
          // failure: stale-while-error — keep previously held data
          setStatus(hasQuotesRef.current ? "ready" : "error");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!mountedRef.current) return;
        setStatus(hasQuotesRef.current ? "ready" : "error");
      } finally {
        inFlight.delete(ac);
      }
    };

    /* runSlowCycle covers both the daily-series feed and the corridor
       feed: both refresh far less often than /latest (60-min timer),
       so they share one mount-time fetch + one interval rather than
       running two nearly-identical cycles side by side. */
    const runSlowCycle = async () => {
      const ac = new AbortController();
      inFlight.add(ac);
      try {
        const [seriesResults, corridorsResult] = await Promise.all([
          Promise.all(
            TRACKED.map(async (b) => {
              const s = await fetchSeries(b, seriesDaysRef.current, ac.signal);
              return [b, s] as const;
            })
          ),
          fetchCorridors(ac.signal),
        ]);
        if (!mountedRef.current || ac.signal.aborted) return;
        setSeries((prev) => {
          const next = { ...prev };
          for (const [b, s] of seriesResults) {
            // failure: stale-while-error — keep the previously held series
            if (s !== null) next[b] = s;
          }
          return next;
        });
        // failure: stale-while-error — keep previously held corridors.
        // Corridors never affect `status`.
        if (corridorsResult !== null) setCorridors(corridorsResult);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // stale-while-error: swallow, keep previously held series/corridors
      } finally {
        inFlight.delete(ac);
      }
    };

    /* initial parallel fetch: /latest + series (every tracked benchmark) + corridors */
    void runLatestCycle();
    void runSlowCycle();

    latestTimer = setInterval(() => {
      if (document.hidden) return;
      void runLatestCycle();
    }, pollMsRef.current);

    slowTimer = setInterval(() => {
      if (document.hidden) return;
      void runSlowCycle();
    }, SLOW_CYCLE_REFRESH_MS);

    const onVisibilityChange = () => {
      if (document.hidden) return;
      const last = lastFetchedAtRef.current;
      if (last === null || Date.now() - last > pollMsRef.current) {
        void runLatestCycle();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mountedRef.current = false;
      for (const ac of inFlight) ac.abort();
      inFlight.clear();
      if (latestTimer !== null) clearInterval(latestTimer);
      if (slowTimer !== null) clearInterval(slowTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { quotes, series, corridors, status, lastFetchedAt };
}
