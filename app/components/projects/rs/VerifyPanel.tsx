"use client";
/* ────────────────────────────────────────────────────────────────
   Dev-mode verification panel — PLAN task 1's verification step:
   "recompute RS percentiles for 3 symbols by hand from API payloads
   and assert in a small test or dev-mode assertion panel." This app
   has no frontend test runner (package.json has none), so this ships
   as an in-app panel instead of a new test-infra dependency.

   It picks 3 rows (low/median/high rank within the visible set),
   independently recomputes each one's tier-scoped rs63 percentile
   from the raw rows (a separate code path from rsData's production
   percentile function), and asserts the two agree — a regression
   guard against silently-wrong percentile math, not a UI decoration.

   Visible only in development or with ?debug=rs in the URL.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";
import type { BullRow } from "../bull/bullData";
import { rs63PercentileBySymbol } from "./rsData";

type Check = {
  symbol: string;
  displayName: string;
  tier: string;
  rs63: number | null;
  expected: number | null;
  actual: number | null;
  pass: boolean;
};

/** Independent re-implementation: sorts the tier pool and walks it
 *  linearly, deliberately not sharing code with rsData.percentileRank
 *  so this is a real cross-check, not the function asserting itself. */
function handComputePercentile(value: number | null, tierPool: number[]): number | null {
  if (value === null || tierPool.length === 0) return null;
  const sorted = [...tierPool].sort((a, b) => a - b);
  let strictlyBelow = 0;
  for (const v of sorted) if (v < value) strictlyBelow++;
  let tiedCount = 0;
  for (const v of sorted) if (v === value) tiedCount++;
  const frac = (strictlyBelow + tiedCount / 2) / sorted.length;
  return Math.round(frac * 1000) / 10;
}

function runChecks(rows: BullRow[]): Check[] {
  if (rows.length < 3) return [];
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  const picks = [byRank[0], byRank[Math.floor(byRank.length / 2)], byRank[byRank.length - 1]];

  const actualBySymbol = rs63PercentileBySymbol(rows);

  return picks.map((row) => {
    const tierPool = rows.filter((r) => r.tier === row.tier && r.rs63 !== null).map((r) => r.rs63 as number);
    const expected = handComputePercentile(row.rs63, tierPool);
    const actual = actualBySymbol.get(row.symbol) ?? null;
    const pass = expected === actual;
    return { symbol: row.symbol, displayName: row.displayName, tier: row.tier, rs63: row.rs63, expected, actual, pass };
  });
}

export default function VerifyPanel({ rows }: { rows: BullRow[] }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isDev = process.env.NODE_ENV !== "production";
    const debugFlag = typeof window !== "undefined" && window.location.search.includes("debug=rs");
    setVisible(isDev || debugFlag);
  }, []);

  if (!visible || rows.length === 0) return null;

  const checks = runChecks(rows);
  if (checks.length === 0) return null;
  const allPass = checks.every((c) => c.pass);

  return (
    <div className="rounded-sm hairline bg-[var(--depth-1)] px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          Verify — RS63 percentile hand-check (dev only)
        </p>
        <p
          className="font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color: allPass ? "#7f9ee8" : "#a8496b" }}
        >
          {allPass ? "PASS" : "FAIL"}
        </p>
      </div>
      <div className="mt-3 space-y-1.5">
        {checks.map((c) => (
          <p key={c.symbol} className="flex flex-wrap items-baseline gap-x-3 font-mono text-[10px] tabular-nums">
            <span className="uppercase tracking-[0.1em] text-[var(--ink-2)]">{c.symbol}</span>
            <span className="text-[var(--ink-3)]">rs63={c.rs63 ?? "null"}</span>
            <span className="text-[var(--ink-3)]">hand={c.expected ?? "null"}</span>
            <span className="text-[var(--ink-3)]">prod={c.actual ?? "null"}</span>
            <span style={{ color: c.pass ? "#7f9ee8" : "#a8496b" }}>{c.pass ? "match" : "MISMATCH"}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
