"use client";
/* ────────────────────────────────────────────────────────────────
   Local scan-history accumulator.

   /api/bull/latest exposes only the latest run — there is no
   backend endpoint for historical scans (PLAN task 1's hard
   constraint: no new backend code). Rather than fabricate RS
   momentum or quadrant trails, this records one entry per symbol
   per distinct `runDate` into localStorage as the app is visited
   over time, so momentum/trails are always literal, locally-observed
   history — thin at first, honestly labeled "warming up" until it
   has depth, never backfilled or estimated.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import type { BullRow } from "../bull/bullData";

const STORAGE_KEY = "a3ro.rs.scanHistory.v1";
const META_KEY = "a3ro.rs.scanHistory.lastRunDate.v1";
const MAX_SCANS = 30;

export type ScanEntry = { runDate: string; rank: number; rs63: number | null };
/** symbol -> entries, oldest first, capped at MAX_SCANS */
export type ScanHistory = Record<string, ScanEntry[]>;

function isScanEntry(v: unknown): v is ScanEntry {
  const o = v as Record<string, unknown>;
  return (
    !!o &&
    typeof o.runDate === "string" &&
    typeof o.rank === "number" &&
    (o.rs63 === null || typeof o.rs63 === "number")
  );
}

function readHistory(): ScanHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ScanHistory = {};
    for (const [symbol, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(list)) out[symbol] = list.filter(isScanEntry);
    }
    return out;
  } catch {
    return {};
  }
}

function writeHistory(h: ScanHistory) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
  } catch {
    /* storage full or unavailable — history is a nice-to-have, drop silently */
  }
}

/** Records the current live snapshot into local history at most once
 *  per distinct `runDate`, then returns the accumulated history.
 *  Reads localStorage only after mount (never in the initial render)
 *  so server and first-client render match — no hydration mismatch. */
export function useScanHistory(rows: BullRow[], runDate: string | null): ScanHistory {
  const [history, setHistory] = useState<ScanHistory>({});
  const [mounted, setMounted] = useState(false);
  const lastRecordedRef = useRef<string | null>(null);

  useEffect(() => {
    setHistory(readHistory());
    try {
      lastRecordedRef.current = window.localStorage.getItem(META_KEY);
    } catch {
      lastRecordedRef.current = null;
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !runDate || rows.length === 0) return;
    if (lastRecordedRef.current === runDate) return;
    setHistory((prev) => {
      const next: ScanHistory = { ...prev };
      for (const r of rows) {
        const list = next[r.symbol] ? [...next[r.symbol]] : [];
        list.push({ runDate, rank: r.rank, rs63: r.rs63 });
        next[r.symbol] = list.slice(-MAX_SCANS);
      }
      writeHistory(next);
      return next;
    });
    lastRecordedRef.current = runDate;
    try {
      window.localStorage.setItem(META_KEY, runDate);
    } catch {
      /* ignore */
    }
  }, [mounted, rows, runDate]);

  return history;
}

/** How many distinct scans this browser has recorded, across every
 *  symbol — used to show an honest "N scans observed locally" note
 *  instead of implying the trail is the full backend history. */
export function scanDepth(history: ScanHistory): number {
  const dates = new Set<string>();
  for (const list of Object.values(history)) for (const e of list) dates.add(e.runDate);
  return dates.size;
}
