"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Regime Shift Finder · homepage module card (P·06)
   The Darius-Dale-style GRID: growth × inflation on a rate-of-change
   basis → one of four quadrants. Reads /api/oil/macro via
   useMacroSnapshot; honest states (cycle pending / feed unreachable)
   with no modeled numbers. Distinct from P·04/P·05 (Bull Market Finder
   1/2), which are bottom-up price-trend screeners.
──────────────────────────────────────────────────────────────── */
import {
  useMacroSnapshot,
  QUADRANT_META,
  MACRO_ACCENT,
  MACRO_AMBER,
  ROUTE,
  formatPct,
  trendArrow,
  type MacroQuadrant,
} from "./macro/macroData";
import { deriveMacroBrief } from "./macro/macroBrief";

const ORDER: Exclude<MacroQuadrant, "PENDING">[] = ["GOLDILOCKS", "REFLATION", "DEFLATION", "INFLATION"];

export default function RegimeShiftFinder({ className = "" }: { className?: string }) {
  const snap = useMacroSnapshot();
  const live = snap.status === "live" && snap.quadrant !== "PENDING";
  const active = live ? (snap.quadrant as Exclude<MacroQuadrant, "PENDING">) : null;
  const regimeTag = live ? deriveMacroBrief(snap).regimeTag : null;

  const stateLine =
    snap.status === "loading"
      ? "Connecting"
      : snap.status === "error"
        ? "Feed unreachable"
        : snap.status === "pending" || snap.quadrant === "PENDING"
          ? "Cycle pending"
          : QUADRANT_META[active as Exclude<MacroQuadrant, "PENDING">].label;

  return (
    <a
      href={ROUTE}
      aria-label="Regime Shift Finder — Darius-Dale-style macro regime, open module"
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
    >
      <div className="relative flex-1 overflow-hidden" style={{ minHeight: 300 }}>
        {/* label block */}
        <div className="pointer-events-none absolute left-5 top-5 z-10 max-w-[56%] md:left-7 md:top-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·06 — <span style={{ color: MACRO_ACCENT }}>Module</span>
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
            A3RO Intelligence
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            Regime Shift Finder
          </h3>
          <p className="mt-3 hidden text-[13px] leading-relaxed text-[var(--ink-2)] md:block">
            Top-down macro regime — growth × inflation on a rate-of-change basis.
          </p>
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            {stateLine}
            {regimeTag && <span style={{ color: MACRO_AMBER }}> · {regimeTag}</span>}
          </p>
          {/* Macro Override chip — pressure + divergence flag */}
          {snap.pressureScore !== null && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 font-mono text-[9px] uppercase tracking-[0.2em]">
              <span className="text-[var(--ink-3)]">Macro Override</span>
              <span style={{ color: snap.diverging ? MACRO_AMBER : "var(--ink-2)" }}>
                {snap.pressureScore}/100{snap.diverging ? " · divergence" : ""}
              </span>
            </p>
          )}
        </div>

        {/* GRID quadrant dial — bottom-right */}
        <div className="absolute bottom-5 right-5 md:bottom-7 md:right-7">
          <div className="relative grid grid-cols-2 gap-1" style={{ width: 148, height: 148 }}>
            {ORDER.map((q) => {
              const meta = QUADRANT_META[q];
              const on = active === q;
              return (
                <div
                  key={q}
                  className="flex flex-col items-center justify-center rounded-[3px] px-1 text-center transition-colors"
                  style={{
                    background: on ? meta.color : "var(--depth-2)",
                    border: `1px solid ${on ? meta.color : "var(--line)"}`,
                    color: on ? "var(--depth-0)" : "var(--ink-3)",
                  }}
                >
                  <span className="font-mono text-[8px] uppercase tracking-[0.15em]">{meta.label}</span>
                </div>
              );
            })}
          </div>
          {/* axis captions */}
          <div className="mt-2 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            <span>Growth {trendArrow(snap.growthMomentum)} {formatPct(snap.growthYoy)}</span>
            <span>Infl {trendArrow(snap.inflationMomentum)} {formatPct(snap.inflationYoy)}</span>
          </div>
        </div>
      </div>

      {/* card footer — directory grammar */}
      <div className="flex items-baseline justify-between gap-4 px-5 py-4 hairline-t">
        <h3 className="text-sm font-medium text-[var(--ink)]">
          A3RO Intelligence — Regime Shift Finder
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Darius-Dale GRID · macro
        </p>
      </div>
    </a>
  );
}
