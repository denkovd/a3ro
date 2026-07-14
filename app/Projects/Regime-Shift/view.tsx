"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Regime-Shift — fullscreen experience shell (P·06)
   The Darius-Dale-style GRID macro regime: growth × inflation on a
   rate-of-change basis → one of four quadrants, plus the Macro
   Override pressure read (headwind-for-oil + divergence). One data
   hook (/api/oil/macro). Esc or "Index" returns to the homepage.
   Distinct from P·04/P·05 (bottom-up price-trend screeners).
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import TapeBanner from "../../components/projects/TapeBanner";
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

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #0e1020 0%, var(--depth-1) 55%, #070808 100%)";

const ORDER: Exclude<MacroQuadrant, "PENDING">[] = ["GOLDILOCKS", "REFLATION", "DEFLATION", "INFLATION"];

export default function RegimeShiftView() {
  const router = useRouter();
  const snap = useMacroSnapshot();
  const [leaving, setLeaving] = useState(false);

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
            aria-label="Close Regime Shift Finder and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — Regime Shift Finder
          </p>
        </div>
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: MACRO_ACCENT }} />
          Macro cycle · FRED
        </p>
      </header>

      {/* ── scroll region ── */}
      <div data-lenis-prevent className="absolute inset-x-0 bottom-12 top-14 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl px-6 pb-16 pt-10 md:px-10">
          {/* title */}
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·06 — Intelligence module
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
            Regime Shift Finder
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-2)]">
            A top-down macro regime read — where are we in the growth/inflation cycle? Growth and
            inflation are measured on a rate-of-change basis (accelerating vs decelerating), placing
            the macro backdrop in one of four GRID quadrants. Free-tier FRED data. Not investment advice.
          </p>

          <TapeBanner className="mt-8" />

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

          {live && (
            <div className="mt-10 grid gap-8 md:grid-cols-2">
              {/* GRID dial */}
              <div>
                <div className="grid grid-cols-2 gap-1.5" style={{ aspectRatio: "1 / 1" }}>
                  {ORDER.map((q) => {
                    const meta = QUADRANT_META[q];
                    const on = active === q;
                    return (
                      <div
                        key={q}
                        className="flex flex-col items-center justify-center rounded-[4px] p-3 text-center transition-colors"
                        style={{
                          background: on ? meta.color : "var(--depth-2)",
                          border: `1px solid ${on ? meta.color : "var(--line)"}`,
                          color: on ? "var(--depth-0)" : "var(--ink-2)",
                        }}
                      >
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
              </div>

              {/* axes + headline */}
              <div className="flex flex-col justify-center gap-5">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Current regime</p>
                  <p className="mt-1 text-2xl font-semibold" style={{ color: active ? QUADRANT_META[active].color : "var(--ink)" }}>
                    {active ? QUADRANT_META[active].label : "—"}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">{snap.regimeHeadline}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-3)]">{snap.favored}</p>
                  {/* Macro Brief Overlay · 1 — horizon ribbon */}
                  <div className="mt-4">
                    <HorizonRibbon brief={brief} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <AxisCard label="Growth (IP)" yoy={snap.growthYoy} momentum={snap.growthMomentum} />
                  <AxisCard label="Inflation (CPI)" yoy={snap.inflationYoy} momentum={snap.inflationMomentum} />
                </div>
              </div>
            </div>
          )}

          {/* Macro Brief Overlay · 2+3 — cycle attribution grid + asset implication strip */}
          {live && <MacroBriefOverlay brief={brief} />}

          {/* Macro Override pressure */}
          {live && (
            <div className="mt-12 border-t border-[var(--line)] pt-8">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
                  Macro Override — pressure
                </p>
                {snap.diverging && (
                  <span
                    className="rounded-[3px] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]"
                    style={{ background: MACRO_AMBER, color: "var(--depth-0)" }}
                  >
                    Macro divergence
                  </span>
                )}
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">{snap.pressureHeadline}</p>
              <div className="mt-5 flex items-baseline gap-3">
                <span className="text-3xl font-semibold text-[var(--ink)]">{snap.pressureScore ?? "—"}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  / 100 · {snap.pressureStatus}
                </span>
              </div>
              {/* legs */}
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
                          background: c.normalized === null ? "var(--line)" : MACRO_ACCENT,
                        }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-mono text-[10px] text-[var(--ink-2)]">
                      {c.value === null ? "pending" : c.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Positioning — CFTC managed money (the other half, P7) */}
              {snap.positioning && (
                <div className="mt-6 border-t border-[var(--line)] pt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                    Positioning · CFTC managed money
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    <span className="text-lg font-semibold" style={{ color: stanceColor(snap.positioning.stance) }}>
                      {stanceLabel(snap.positioning.stance)}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--ink-2)]">
                      net {snap.positioning.netLength === null ? "—" : snap.positioning.netLength.toLocaleString("en-US")}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--ink-3)]">
                      {snap.positioning.percentile1y === null
                        ? "1y percentile pending"
                        : `${Math.round(snap.positioning.percentile1y * 100)}th pctile · 1y`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── bottom chrome ── */}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] backdrop-blur-md md:px-10">
        <span>P·06 — Regime Shift Finder</span>
        <span>{live ? `Macro read ${formatDate(snap.runDate)}` : "Trend-state readouts on free data feeds · not investment advice"}</span>
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
