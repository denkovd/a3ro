"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Regime-Shift — fullscreen experience shell (P·03)

   Dale's macro regime model, in his own three layers
   (docs/regime-macro-refresh.md):

     1 · bottom-up GRID      — what regime is the ECONOMY in
                               (growth × inflation, rate-of-change)
     2 · Global Macro Risk   — what regime is the MARKET PRICING
         Matrix (VAMS)         (per-market vol-adjusted momentum →
                               regime confirmation shares)
     3 · the six cycles      — is that regime SUSTAINABLE
                               (growth, inflation, policy, corporate
                               profits, liquidity, positioning)

   The KISS allocation target follows the GRID, ahead of the supporting
   market and cycle detail. The 24 Jul 2026 read — liquidity stress and
   cost of capital — and the oil overlay follow at the foot.

   One data hook (/api/macro/latest). Esc or "Index" returns home.
   Distinct from P·04/P·05 (bottom-up price-trend screeners).
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  useMacroSnapshot,
  QUADRANT_META,
  MACRO_ACCENT,
  MACRO_AMBER,
  MACRO_PINK,
  formatPct,
  formatDate,
  trendArrow,
  type MacroQuadrant,
  type PositioningStance,
} from "../../components/projects/macro/macroData";
import { deriveMacroBrief } from "../../components/projects/macro/macroBrief";
import MacroBriefOverlay, { HorizonRibbon } from "../../components/projects/macro/MacroBriefOverlay";
import RiskMatrixPanel from "../../components/projects/macro/RiskMatrixPanel";
import { LiquidityPanel, CostOfCapitalPanel } from "../../components/projects/macro/LiquidityPanel";
import AllocationPanel from "../../components/projects/macro/AllocationPanel";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import { macroFreshness, formatMacroUpdated, formatMacroPeriod } from "../../components/projects/macro/macroFreshness";

const BacktestPanel = dynamic(() => import("../../components/projects/macro/BacktestPanel"), {
  loading: () => <p role="status" className="mt-6 text-sm text-[var(--ink-2)]">Opening research laboratory…</p>,
});

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #0e1020 0%, var(--depth-1) 55%, #070808 100%)";
const MARKET_GRID_RED = "#a43d49";

const ORDER: Exclude<MacroQuadrant, "PENDING">[] = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"];

/** Risk-on regimes sit on the top row of the GRID. Dale's point: it is
 *  the HORIZONTAL crossing (risk-on ↔ risk-off) that forces wholesale
 *  allocation pivots — vertical moves within a risk stance are
 *  incremental. The dial marks that boundary rather than rendering all
 *  four transitions as equivalent. */
const RISK_ON: MacroQuadrant[] = ["GOLDILOCKS", "REFLATION"];

export default function RegimeShiftView() {
  const router = useRouter();
  const snap = useMacroSnapshot();
  const [leaving, setLeaving] = useState(false);
  const [oilOpen, setOilOpen] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchLoaded, setResearchLoaded] = useState(false);

  const openResearch = useCallback(() => {
    setResearchLoaded(true);
    setResearchOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("regime-tools-heading")?.scrollIntoView({ block: "start" });
    });
  }, []);

  useEffect(() => {
    const followResearchLink = () => {
      if (location.hash === "#backtest-heading") openResearch();
    };
    followResearchLink();
    window.addEventListener("hashchange", followResearchLink);
    return () => window.removeEventListener("hashchange", followResearchLink);
  }, [openResearch]);

  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
  }, [leaving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  const live = snap.status === "live" && snap.quadrant !== "PENDING";
  const active = live ? (snap.quadrant as Exclude<MacroQuadrant, "PENDING">) : null;
  const brief = deriveMacroBrief(snap);
  const freshness = macroFreshness(snap);
  const riskStance = active ? (RISK_ON.includes(active) ? "risk-on" : "risk-off") : null;

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
            aria-label="Close US regime and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — US regime
          </p>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <ModuleSwitcher current="regime" />
        </div>
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: MACRO_ACCENT }} />
          Macro cycle · FRED + cross-asset
        </p>
      </header>

      {/* ── scroll region ── */}
      <div data-lenis-prevent className="absolute inset-x-0 bottom-12 top-14 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl px-6 pb-16 pt-10 md:px-10">
          {/* title */}
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·03 — Intelligence module
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
            US regime
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-2)]">
            A US macro regime read in three layers: where the economy sits on the growth/inflation
            GRID, which regime cross-asset markets are actually pricing, and whether the six macro cycles
            support that regime continuing. Free-tier FRED and market data. Not investment advice.
          </p>
          {live && (
            <div className="mt-4 text-[12px] leading-relaxed text-[var(--ink-3)]" role="status">
              <p>{formatMacroUpdated(snap.computedAt)} · Checks for updates every 5 minutes.</p>
              <p>Growth data: {formatMacroPeriod(snap.cycles.find((c) => c.key === "growth")?.asOf)} · Inflation data: {formatMacroPeriod(snap.cycles.find((c) => c.key === "inflation")?.asOf)}. The economic regime changes when new monthly releases change the growth or inflation trend.</p>
              {(freshness !== "current" || snap.refreshError) && (
                <p style={{ color: MACRO_AMBER }}>
                  {snap.refreshError ? "Refresh unavailable — showing the last successful reading. Retrying automatically." : freshness === "stale" ? "Stale data — showing the last available regime while awaiting a fresh snapshot." : "Freshness unverified — source dates or update time are unavailable."}
                </p>
              )}
            </div>
          )}

          {snap.status === "loading" && (
            <p className="mt-16 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              Connecting…
            </p>
          )}
          {snap.status === "error" && (
            <p className="mt-16 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              Feed unreachable — {snap.errorMessage ?? "macro api error"}
            </p>
          )}
          {(snap.status === "pending" || (snap.status === "live" && snap.quadrant === "PENDING")) && (
            <p className="mt-16 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              Macro cycle pending — awaiting first FRED read
            </p>
          )}

          {/* ── layer 1: the economic GRID ── */}
          {live && (
            <>
              <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
                The GRID — what the economy is doing
              </p>
              <div className="mt-4 grid gap-8 md:grid-cols-2">
                <div>
                  <div className="grid grid-cols-2 gap-1.5" style={{ aspectRatio: "1 / 1" }}>
                    {ORDER.map((q) => {
                      const meta = QUADRANT_META[q];
                      const on = active === q;
                      const marketOn = snap.marketRegime === q;
                      return (
                        <div
                          key={q}
                          role="group"
                          aria-label={`${meta.label}${on ? " — economic regime" : ""}${marketOn ? " — market regime" : ""}`}
                          className="relative flex flex-col items-center justify-center rounded-[4px] p-3 text-center transition-colors"
                          style={{
                            background: on ? meta.color : marketOn ? MARKET_GRID_RED : "var(--depth-2)",
                            border: `1px solid ${marketOn ? MARKET_GRID_RED : on ? meta.color : "var(--line)"}`,
                            boxShadow: on && marketOn ? `inset 0 0 0 2px ${MARKET_GRID_RED}` : undefined,
                            color: on ? "var(--depth-0)" : marketOn ? "#fff1f2" : "var(--ink-2)",
                          }}
                        >
                          {(on || marketOn) && (
                            <div className="absolute inset-x-2 top-2 flex flex-wrap justify-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em]">
                              {on && <span className="rounded-[2px] border border-current px-1.5 py-0.5">Economy</span>}
                              {marketOn && <span className="rounded-[2px] px-1.5 py-0.5" style={{ background: MARKET_GRID_RED, color: "#fff1f2", border: "1px solid rgba(255,241,242,.5)" }}>Market</span>}
                            </div>
                          )}
                          <span className="text-sm font-semibold">{meta.label}</span>
                          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.15em] opacity-80">
                            {meta.short}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                    <span>← inflation cooling · accelerating →</span>
                  </div>
                  <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                    Top row risk-on · bottom row risk-off — crossing that boundary is the consequential shift
                  </p>
                </div>

                {/* axes + headline */}
                <div className="flex flex-col justify-center gap-5">
                  <div
                    className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-1)] p-4"
                    style={{ borderLeft: `2px solid ${active ? QUADRANT_META[active].color : "var(--line)"}` }}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                      {freshness === "current" && !snap.refreshError ? "Current US economic regime" : "Last available US economic regime"} {riskStance && <span className="text-[var(--ink-2)]">· {riskStance}</span>}
                    </p>
                    <p
                      className="mt-1 flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold"
                      style={{ color: active ? QUADRANT_META[active].color : "var(--ink)" }}
                    >
                      <span>{active ? QUADRANT_META[active].label : "—"}</span>
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">{snap.regimeHeadline}</p>
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-3)]">{snap.favored}</p>
                    <div className="mt-4 border-t border-[var(--line)] pt-3">
                      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">Editorial outlook · {formatMacroPeriod(brief.asOf)}</p>
                      <HorizonRibbon brief={brief} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <AxisCard label="Growth (IP)" yoy={snap.growthYoy} momentum={snap.growthMomentum} />
                    <AxisCard label="Inflation (CPI)" yoy={snap.inflationYoy} momentum={snap.inflationMomentum} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── allocation target: the rule's expression of all three layers ── */}
          {live && <AllocationPanel snap={snap} onOpenResearch={openResearch} />}

          {/* ── layer 2: what the market is pricing ── */}
          {live && <RiskMatrixPanel snap={snap} />}

          {/* ── layer 3: the six cycles + asset implications ── */}
          {live && <MacroBriefOverlay brief={brief} snap={snap} />}

          {/* ── the 24 Jul read: liquidity stress + cost of capital ── */}
          {live && <LiquidityPanel snap={snap} />}
          {live && <CostOfCapitalPanel brief={brief} snap={snap} />}

          {/* ── optional tools, closed until the reader chooses to explore ── */}
          <section className="mt-12 border-t border-[var(--line)] pt-8" aria-labelledby="regime-tools-heading">
            <h2 id="regime-tools-heading" className="font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--ink-2)]">Explore further</h2>
            <p className="mt-2 text-xs text-[var(--ink-3)]">Optional tools to test ideas and explore the detail.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" aria-expanded={researchOpen} aria-controls="regime-research"
                onClick={() => researchOpen ? setResearchOpen(false) : openResearch()}
                className="flex min-h-20 items-start justify-between gap-4 rounded border border-[var(--line)] bg-[var(--depth-1)] p-4 text-left transition-colors hover:border-[var(--ink-3)]">
                <span><span className="block text-sm text-[var(--ink)]">Research laboratory</span><span className="mt-1 block text-xs leading-relaxed text-[var(--ink-2)]">Test strategies and compare historical performance.</span></span>
                <span aria-hidden className="text-lg text-[var(--ink-2)]">{researchOpen ? "−" : "+"}</span>
              </button>
              {live && <button type="button" aria-expanded={oilOpen} aria-controls="regime-oil-overlay"
                onClick={() => setOilOpen((v) => !v)}
                className="flex min-h-20 items-start justify-between gap-4 rounded border border-[var(--line)] bg-[var(--depth-1)] p-4 text-left transition-colors hover:border-[var(--ink-3)]">
                <span><span className="block text-sm text-[var(--ink)]">Oil overlay</span><span className="mt-1 block text-xs leading-relaxed text-[var(--ink-2)]">Explore macro pressure on crude.</span></span>
                <span aria-hidden className="text-lg text-[var(--ink-2)]">{oilOpen ? "−" : "+"}</span>
              </button>}
            </div>
            <div id="regime-research" hidden={!researchOpen}>
              {researchLoaded && <BacktestPanel />}
            </div>
            {live && <div id="regime-oil-overlay" hidden={!oilOpen} className="mt-8 border-t border-[var(--line)] pt-6">
              {oilOpen && <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-2)]">
                  Oil overlay — macro pressure on crude
                </h3>
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  {snap.pressureScore ?? "—"}/100 · {snap.pressureStatus}
                  {snap.diverging && (
                    <span
                      className="rounded-[3px] px-2 py-0.5 text-[9px]"
                      style={{ background: MACRO_AMBER, color: "var(--depth-0)" }}
                    >
                      divergence
                    </span>
                  )}
                </span>
              </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">{snap.pressureHeadline}</p>
                  <div className="mt-5 space-y-2">
                    {snap.components.map((c) => (
                      <div key={c.key} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                          {c.label}
                        </span>
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--depth-2)]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round((c.normalized ?? 0) * 100)}%`,
                              background: c.normalized === null ? "var(--line)" : MACRO_AMBER,
                            }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right font-mono text-[10px] text-[var(--ink-2)]">
                          {c.value === null ? "pending" : c.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {snap.positioning && (
                    <div className="mt-6 border-t border-[var(--line)] pt-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                        WTI futures positioning
                      </p>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                        <span className="text-lg font-semibold" style={{ color: stanceColor(snap.positioning.stance) }}>
                          {stanceLabel(snap.positioning.stance)}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--ink-2)]">
                          net{" "}
                          {snap.positioning.netLength === null
                            ? "—"
                            : snap.positioning.netLength.toLocaleString("en-US")}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--ink-3)]">
                          {snap.positioning.percentile1y === null
                            ? "1y percentile pending"
                            : `${Math.round(snap.positioning.percentile1y * 100)}th pctile · 1y`}
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="mt-5 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
                    Crude&apos;s own read on the same macro panel, kept for the Oil Tracker&apos;s Macro Override
                    chip. The legs here are scaled as headwinds for oil specifically — the macro positioning cycle
                    above uses realized-volatility crowding, not WTI managed money.
                  </p>
              </>}
            </div>}
          </section>
        </div>
      </div>

      {/* ── bottom chrome ── */}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] backdrop-blur-md md:px-10">
        <span>P·03 — US regime</span>
        <span>
          {live
            ? `Macro read ${formatDate(snap.runDate)}`
            : "Trend-state readouts on free data feeds · not investment advice"}
        </span>
      </footer>
    </motion.main>
  );
}

function stanceLabel(s: PositioningStance): string {
  return s === "CROWDED_LONG"
    ? "Crowded long"
    : s === "CROWDED_SHORT"
      ? "Crowded short"
      : s === "NEUTRAL"
        ? "Neutral"
        : "Building history";
}
function stanceColor(s: PositioningStance): string {
  return s === "CROWDED_LONG"
    ? MACRO_AMBER
    : s === "CROWDED_SHORT"
      ? MACRO_PINK
      : s === "NEUTRAL"
        ? "var(--ink-2)"
        : "var(--ink-3)";
}

function AxisCard({ label, yoy, momentum }: { label: string; yoy: number | null; momentum: number | null }) {
  return (
    <div className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-1)] p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--ink)]">
        {trendArrow(momentum)} {formatPct(yoy)}
      </p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
        {momentum === null ? "—" : momentum >= 0 ? "accelerating" : "decelerating"} · YoY
      </p>
    </div>
  );
}
