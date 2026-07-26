"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Relative-Strength — fullscreen experience shell (P·09)

   PLAN-frontend-intelligence-modules.md Task 1. Everything here
   reads from the same two endpoints the Bull Market Finder already
   uses (/api/bull/latest, /api/bull/transitions) — no new backend
   code. RS63 is the API's benchmark-relative reading; every other
   window/momentum/trail figure on this page is honestly labeled as
   either a real client-side computation (BTC-USD's own bar series)
   or a local scan-history accumulation this browser has observed —
   never a modeled or fabricated number.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  useBullSnapshot,
  useBullTransitions,
  DEFAULT_STRATEGY_ID,
  formatDate,
} from "../../components/projects/bull/bullData";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import VerdictCountStrip from "../../components/projects/rs/VerdictCountStrip";
import LeadershipStrip from "../../components/projects/rs/LeadershipStrip";
import Heatmap from "../../components/projects/rs/Heatmap";
import QuadrantView from "../../components/projects/rs/QuadrantView";
import RotationTable from "../../components/projects/rs/RotationTable";
import UploadPanel from "../../components/projects/rs/UploadPanel";
import VerifyPanel from "../../components/projects/rs/VerifyPanel";
import { useSeriesRs, type SeriesRsState } from "../../components/projects/rs/rsSeries";
import type { RsWindow } from "../../components/projects/rs/rsData";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #0c1018 0%, var(--depth-1) 55%, #070808 100%)";

const SECTION_HEAD =
  "font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]";

function buildSeriesMap(btc: SeriesRsState): Map<string, Partial<Record<RsWindow, number>>> {
  const m = new Map<string, Partial<Record<RsWindow, number>>>();
  if (btc.status === "live") m.set("BTC-USD", btc.windows);
  return m;
}

export default function RelativeStrengthView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [strategy, setStrategy] = useState<string>(DEFAULT_STRATEGY_ID);
  const snap = useBullSnapshot(strategy);
  const transitions = useBullTransitions(14, strategy);
  const btcSeries = useSeriesRs("BTC-USD");
  const [leaving, setLeaving] = useState(false);

  const seriesWindowsBySymbol = useMemo(() => buildSeriesMap(btcSeries), [btcSeries]);
  const strategies = snap.strategies;

  const leave = useCallback(() => {
    if (leaving) return;
    if (reduced) {
      router.push("/#modules");
      return;
    }
    setLeaving(true);
  }, [leaving, reduced, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  const live = snap.status === "live";

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

      <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <div className="flex items-baseline gap-4">
          <button
            onClick={leave}
            className="sweep font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            aria-label="Close Relative Strength Matrix and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — Relative Strength Matrix
          </p>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <ModuleSwitcher current="rs" />
        </div>
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          {!reduced ? (
            <motion.span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: "#7f9ee8" }}
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: "#7f9ee8" }} />
          )}
          Derived from the Bull Market Finder scan
        </p>
      </header>

      <div
        data-lenis-prevent
        className="absolute inset-x-0 bottom-12 top-14 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
                P·09 — Intelligence module
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
                Relative Strength Matrix
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[var(--ink-2)]">
                Who is leading, who is lagging, and who just rotated — built
                entirely on the Bull Market Finder&rsquo;s scan: RS63 from the
                API, a percentile heatmap, an RRG-style quadrant, and a
                rotation table fed by verdict transitions.
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

          {/* per-tier regime strip — Regime-Monitor salvage, shared with Bull Finder */}
          {live && (
            <div className="mt-8">
              <VerdictCountStrip rows={snap.rows} />
            </div>
          )}

          {/* strategy switcher — same lens as Bull Market Finder, since verdict
              (and therefore the regime strip / leadership grouping) depends on it */}
          <div className="mt-8 flex flex-wrap items-baseline gap-1.5">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              Strategy
            </span>
            {strategies.map((s) => {
              const active = strategy === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  aria-pressed={active}
                  className="rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-micro)]"
                  style={{
                    color: active ? "#7f9ee8" : "var(--ink-3)",
                    background: active ? "rgba(127, 158, 232, 0.10)" : "transparent",
                    border: `1px solid ${active ? "rgba(127, 158, 232, 0.35)" : "var(--line)"}`,
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* honest empty states for the whole module */}
          {!live && (
            <div className="mt-10 flex flex-col items-center gap-3 py-20 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
                {snap.status === "pending" ? "Scan pending" : snap.status === "error" ? "Feed unreachable" : "Connecting…"}
              </p>
              <p className="max-w-md text-[13px] leading-relaxed text-[var(--ink-3)]">
                {snap.status === "pending"
                  ? "The first whole-market scan runs at 06:20 UTC via the daily workflow. RS readings appear here once the universe has been scored."
                  : snap.status === "error"
                    ? snap.errorMessage ?? "The screener feed did not respond — reload to retry."
                    : "Loading the latest scan…"}
              </p>
            </div>
          )}

          {live && (
            <>
              <section className="mt-12 border-t border-[var(--line)] pt-8">
                <p className={SECTION_HEAD}>Leadership — top / bottom by RS momentum</p>
                <div className="mt-4">
                  <LeadershipStrip rows={snap.rows} runDate={snap.runDate} />
                </div>
              </section>

              <section className="mt-12 border-t border-[var(--line)] pt-8">
                <p className={SECTION_HEAD}>Heatmap — RS rank percentile by window</p>
                <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[var(--ink-3)]">
                  3M is the API&rsquo;s RS63 (benchmark-relative). 1M/6M/1Y need a
                  per-symbol daily bar series, which today only exists for
                  BTC-USD — every other symbol shows <code>no_data</code> there
                  rather than a guess.
                </p>
                <div className="mt-4">
                  <Heatmap rows={snap.rows} seriesWindowsBySymbol={seriesWindowsBySymbol} />
                </div>
              </section>

              <section className="mt-12 border-t border-[var(--line)] pt-8">
                <p className={SECTION_HEAD}>Quadrant — RRG-style leaders vs. laggards</p>
                <div className="mt-4">
                  <QuadrantView rows={snap.rows} runDate={snap.runDate} />
                </div>
              </section>

              <section className="mt-12 border-t border-[var(--line)] pt-8">
                <p className={SECTION_HEAD}>Rotation — recent verdict transitions</p>
                <div className="mt-4">
                  <RotationTable transitions={transitions.rows} status={transitions.status} rows={snap.rows} />
                </div>
              </section>

              <section className="mt-12 border-t border-[var(--line)] pt-8">
                <p className={SECTION_HEAD}>Upload — symbols outside the scan universe</p>
                <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[var(--ink-3)]">
                  Optional. A CSV/XLSX with <code>symbol,rs63</code> columns, or
                  <code> symbol,date,close</code> rows to derive a self-return.
                  Parsed in your browser — nothing is uploaded anywhere.
                </p>
                <div className="mt-4">
                  <UploadPanel />
                </div>
              </section>

              <section className="mt-12 border-t border-[var(--line)] pt-8">
                <VerifyPanel rows={snap.rows} />
              </section>
            </>
          )}

          <p className="mt-10 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
            RS 63d = 63-session return minus the tier benchmark (S&amp;P 500 for
            equities/ETFs, BTC for crypto), computed server-side by the Money
            Line engine — the same field the Bull Market Finder ranks on. RS
            momentum and quadrant trails come from a local scan-history
            accumulator in this browser (localStorage), not a backend history
            table, so they warm up over repeated visits rather than appearing
            complete on day one. Not investment advice.
          </p>
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          P·09 — Relative Strength Matrix
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          Derived readouts on free data feeds · not investment advice
        </p>
      </footer>
    </motion.main>
  );
}
