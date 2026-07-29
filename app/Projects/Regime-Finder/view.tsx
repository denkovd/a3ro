"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Regime-Finder — fullscreen experience shell (P·04)
   The ranked regime table: every watchlist asset with its Money
   Line state on daily × weekly, grouped newly-bullish → bullish →
   conflicted → bearish, recency first. Lighter than the Oil shell
   (no heavy engine): one data hook, one scrollable table.
   Esc or "Index" returns to the homepage modules section.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  useRegimeSnapshot,
  withGroupBoundaries,
  verdictDistribution,
  GROUP_LABEL,
  VERDICT_META,
  formatDate,
  formatDaysSince,
  formatPct,
  formatPrice,
  REGIME_ACCENT,
  MUTED_AMBER,
  MUTED_PINK,
  type RegimeRow,
  type RegimeGroupKey,
} from "../../components/projects/regime/regimeData";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #0d1512 0%, var(--depth-1) 55%, #070808 100%)";

/* table grid — one source of truth for header + rows */
const GRID =
  "grid grid-cols-[2.75rem_minmax(10.5rem,1.6fr)_8.25rem_2rem_2rem_8.5rem_5.75rem_5.75rem_7.25rem] items-baseline gap-x-3";

const trendGlyph = (t: number) => (t > 0 ? "▲" : t < 0 ? "▼" : "·");
const trendColor = (t: number) =>
  t > 0 ? REGIME_ACCENT : t < 0 ? MUTED_PINK : "var(--ink-3)";

const pctColor = (v: number | null) =>
  v === null ? "var(--ink-3)" : v > 0 ? REGIME_ACCENT : v < 0 ? MUTED_PINK : "var(--ink-2)";

const verdictChip = (r: RegimeRow): string =>
  r.verdict === "CONFLICT_DAILY"
    ? "CONF · D"
    : r.verdict === "CONFLICT_WEEKLY"
      ? "CONF · W"
      : VERDICT_META[r.verdict].short;

const GROUP_DOT: Record<RegimeGroupKey, string> = {
  newlyBullish: REGIME_ACCENT,
  bullish: REGIME_ACCENT,
  conflictDaily: MUTED_AMBER,
  conflictWeekly: MUTED_AMBER,
  bearish: MUTED_PINK,
  warmup: "var(--ink-3)",
};

/* “Aligned / Flip” cell — alignment date for aligned states, the
   bullish/current leg’s flip date for conflicts and warm-up. */
function alignedCell(r: RegimeRow): string {
  if (r.verdict === "BULLISH" || r.verdict === "BEARISH") {
    return `${formatDate(r.alignedSince)} · ${formatDaysSince(r.daysSinceAligned)}`;
  }
  if (r.verdict === "CONFLICT_DAILY") return `${formatDate(r.dailyFlipDate)} · D`;
  if (r.verdict === "CONFLICT_WEEKLY") return `${formatDate(r.weeklyFlipDate)} · W`;
  return "—";
}

export default function RegimeFinderView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const snap = useRegimeSnapshot();
  const [leaving, setLeaving] = useState(false);

  const leave = useCallback(() => {
    if (leaving) return;
    if (reduced) {
      router.push("/#modules");
      return;
    }
    setLeaving(true);
  }, [leaving, reduced, router]);

  /* Esc returns to the index — same affordance as the Oil shell */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  const live = snap.status === "live";
  const dist = verdictDistribution(snap.rows);
  const newlyCount = snap.rows.filter((r) => r.newlyBullish).length;
  const grouped = withGroupBoundaries(snap.rows);

  return (
    <motion.main
      className="grain fixed inset-0 overflow-hidden bg-[var(--depth-0)]"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.28, ease: "easeInOut" }}
      onAnimationComplete={() => {
        if (leaving) router.push("/#modules");
      }}
    >
      <div aria-hidden className="absolute inset-0" style={{ background: ATMOSPHERE }} />

      {/* ── top chrome ── */}
      <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <div className="flex items-baseline gap-4">
          <button
            onClick={leave}
            className="sweep font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            aria-label="Close Bull Market Finder 1 and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — Bull Market Finder 1
          </p>
        </div>
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          {!reduced ? (
            <motion.span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: REGIME_ACCENT }}
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: REGIME_ACCENT }}
            />
          )}
          Daily scan · Money Line engine
        </p>
      </header>

      {/* ── scroll region between the chromes ── */}
      <div
        data-lenis-prevent
        className="absolute inset-x-0 bottom-12 top-14 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:px-10">
          {/* title row */}
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
                P·04 — Intelligence module
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
                Bull Market Finder 1
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[var(--ink-2)]">
                Money Line bullish-state screener across a 45-asset macro
                watchlist — Donchian&nbsp;20 close-flips, double-confirmed on
                daily and weekly closes, ranked by how recently trends aligned.
                (Variant 1 · macro-45 universe.)
              </p>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              {live
                ? `Scan ${formatDate(snap.runDate)} · ${snap.count} assets`
                : snap.status === "pending"
                  ? "Awaiting first scan"
                  : snap.status === "error"
                    ? "Feed unreachable"
                    : "Connecting…"}
            </p>
          </div>

          {/* summary strip */}
          {live && (
            <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-sm hairline bg-[var(--line)] md:grid-cols-4">
              {[
                { label: "Newly bullish", value: newlyCount, color: REGIME_ACCENT },
                { label: "Bullish", value: dist.bullish, color: REGIME_ACCENT },
                { label: "Conflicted", value: dist.conflicted, color: MUTED_AMBER },
                { label: "Bearish", value: dist.bearish, color: MUTED_PINK },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[var(--depth-1)] px-5 py-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                    {label}
                  </p>
                  <p
                    className="mt-2 font-mono text-2xl font-medium tabular-nums tracking-tight"
                    style={{ color }}
                  >
                    {String(value).padStart(2, "0")}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── the ranked table ── */}
          <div className="mt-10 overflow-x-auto">
            <div className="min-w-[56rem]">
              {/* header */}
              <div className={`${GRID} border-b border-[var(--line)] pb-3`}>
                {[
                  "Rank", "Asset", "Verdict", "D", "W",
                  "Aligned / Flip", "Since flip", "Cushion", "Last close",
                ].map((h, i) => (
                  <p
                    key={h}
                    className={`font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)] ${
                      i >= 6 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </p>
                ))}
              </div>

              {/* loading skeleton — quiet, deterministic */}
              {snap.status === "loading" && (
                <div aria-hidden className="animate-pulse">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className={`${GRID} border-b border-[var(--line)] py-3.5`}>
                      {Array.from({ length: 9 }, (_, j) => (
                        <span key={j} className="h-[9px] rounded-full bg-[var(--depth-3)]" />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* honest empty states */}
              {(snap.status === "pending" || snap.status === "error") && (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
                    {snap.status === "pending" ? "Scan pending" : "Feed unreachable"}
                  </p>
                  <p className="max-w-md text-[13px] leading-relaxed text-[var(--ink-3)]">
                    {snap.status === "pending"
                      ? "The first regime scan runs at 06:00 UTC with the daily ingestion cycle. States appear here once the watchlist has been scored."
                      : snap.errorMessage ?? "The regime feed did not respond — reload to retry."}
                  </p>
                </div>
              )}

              {/* rows, grouped by regime state */}
              {live &&
                grouped.map(({ row: r, group, startsGroup }, idx) => (
                  <div key={r.symbol}>
                    {startsGroup && (
                      <div className={`flex items-center gap-2.5 pb-2.5 ${idx === 0 ? "mt-4" : "mt-7"}`}>
                        <span
                          aria-hidden
                          className="h-[5px] w-[5px] rounded-full"
                          style={{
                            background: GROUP_DOT[group],
                            boxShadow:
                              group === "newlyBullish"
                                ? `0 0 8px ${REGIME_ACCENT}66`
                                : "none",
                          }}
                        />
                        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                          {GROUP_LABEL[group]}
                        </p>
                      </div>
                    )}

                    <div
                      className={`${GRID} border-b border-[var(--line)] py-3 transition-colors duration-[var(--dur-micro)] hover:bg-[rgba(232,235,232,0.02)]`}
                      style={
                        r.newlyBullish
                          ? { background: "rgba(95, 201, 164, 0.045)" }
                          : undefined
                      }
                    >
                      <p className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                        {String(r.rank).padStart(2, "0")}
                      </p>

                      <p className="flex min-w-0 items-baseline gap-2.5">
                        <span className="truncate text-sm text-[var(--ink)]">
                          {r.displayName}
                        </span>
                        <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                          {r.assetClass}
                        </span>
                        {r.newlyBullish && (
                          <span
                            className="shrink-0 rounded-[2px] px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.2em]"
                            style={{
                              color: REGIME_ACCENT,
                              background: "rgba(95, 201, 164, 0.12)",
                            }}
                          >
                            New
                          </span>
                        )}
                      </p>

                      <p
                        className="font-mono text-[10px] uppercase tracking-[0.15em]"
                        style={{ color: VERDICT_META[r.verdict].color }}
                      >
                        {verdictChip(r)}
                      </p>

                      <p className="font-mono text-[11px]" style={{ color: trendColor(r.dailyTrend) }}>
                        {trendGlyph(r.dailyTrend)}
                      </p>
                      <p className="font-mono text-[11px]" style={{ color: trendColor(r.weeklyTrend) }}>
                        {trendGlyph(r.weeklyTrend)}
                      </p>

                      <p className="font-mono text-[10px] tabular-nums text-[var(--ink-2)]">
                        {alignedCell(r)}
                      </p>

                      <p
                        className="text-right font-mono text-[11px] tabular-nums"
                        style={{ color: pctColor(r.dailySinceFlipPct) }}
                      >
                        {formatPct(r.dailySinceFlipPct)}
                      </p>
                      <p className="text-right font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                        {formatPct(r.dailyCushionPct)}
                      </p>
                      <p className="text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">
                        {formatPrice(r.lastClose)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* methodology footnote */}
          <p className="mt-10 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
            States — Bullish: bullish on daily and weekly · Conflicted: bullish
            on one timeframe only · Bearish: bearish on both. Flips confirm
            only on candle close (Donchian&nbsp;20, ratcheted); the current
            week never counts until it closes. Newly bullish = daily × weekly
            alignment began within the last 10 sessions. Ranked by recency;
            strength (cushion above the flip line + move since flip) breaks
            ties. Since flip, cushion and close are daily-timeframe readouts.
          </p>
        </div>
      </div>

      {/* ── bottom chrome ── */}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          P·04 — Bull Market Finder 1
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          Trend-state readouts on free data feeds · not investment advice
        </p>
      </footer>
    </motion.main>
  );
}
