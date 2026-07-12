"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Thesis Lab · homepage module card (P·07).
   The pressure-test surface: thesis in → assumptions scored for
   confidence & fragility against the live tape → scenarios →
   portfolio risk audit. The card shows the saved-thesis shelf state
   (count + latest verdict) with honest fallbacks, and a decorative
   load-test motif: five legs under a beam, the weakest one failing.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  apiListTheses,
  verdictColor,
  LAB_ACCENT,
  LAB_PINK,
  LAB_ROUTE,
  type ThesisSummary,
} from "./thesis/thesisData";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 62%, #0a1416 0%, var(--depth-1) 55%, #070808 100%)";

type ShelfState = { status: "loading" | "live" | "empty" | "setup" | "error"; theses: ThesisSummary[] };

/* Decorative load-test motif — a beam on five legs; the weakest leg
   is fractured. Hardcoded, deterministic, aria-hidden (module grammar
   texture, not data). x positions of legs across the beam. */
const LEGS = [14, 32, 50, 68, 86];
const WEAK_LEG = 1; // index of the fractured leg

export default function ThesisLab({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const [shelf, setShelf] = useState<ShelfState>({ status: "loading", theses: [] });

  useEffect(() => {
    let alive = true;
    apiListTheses().then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setShelf({ status: r.setup ? "setup" : "error", theses: [] });
        return;
      }
      setShelf({ status: r.data.length ? "live" : "empty", theses: r.data });
    });
    return () => {
      alive = false;
    };
  }, []);

  const latest = shelf.theses[0] ?? null;
  const monitorText =
    shelf.status === "live"
      ? "Engine · deterministic"
      : shelf.status === "setup"
        ? "Engine · migration pending"
        : shelf.status === "error"
          ? "Engine · feed unreachable"
          : shelf.status === "empty"
            ? "Engine · ready"
            : "Engine · connecting";

  return (
    <a
      href={LAB_ROUTE}
      aria-label="Thesis Lab — pressure-test a trading thesis, open module"
      className={`group/tl relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
    >
      <div className="relative flex-1 overflow-hidden">
        <div aria-hidden className="absolute inset-0" style={{ background: ATMOSPHERE }} />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0px, transparent 47px, var(--line) 48px)",
          }}
        />

        {/* load-test motif — beam, legs, one fracture */}
        <div aria-hidden className="absolute inset-x-12 bottom-12 top-[58%]">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* the beam (the thesis) */}
            <line x1="6" y1="24" x2="94" y2="24" stroke={LAB_ACCENT} strokeOpacity="0.55" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            {/* load arrows pressing down */}
            {[26, 50, 74].map((x) => (
              <g key={x} stroke="var(--ink-3)" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke">
                <line x1={x} y1="4" x2={x} y2="16" />
                <path d={`M${x - 2.5},12 L${x},17 L${x + 2.5},12`} fill="none" />
              </g>
            ))}
            {/* legs (the assumptions) */}
            {LEGS.map((x, i) =>
              i === WEAK_LEG ? (
                <g key={x}>
                  {/* fractured leg — offset halves + fracture flash */}
                  <line x1={x} y1="26" x2={x - 2.5} y2="58" stroke={LAB_PINK} strokeOpacity="0.85" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  <line x1={x + 3} y1="66" x2={x + 1} y2="92" stroke={LAB_PINK} strokeOpacity="0.5" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  <path d={`M${x - 6},60 L${x + 1},62 L${x - 3},66`} fill="none" stroke={LAB_PINK} strokeOpacity="0.7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                </g>
              ) : (
                <line key={x} x1={x} y1="26" x2={x} y2="92" stroke="var(--ink-3)" strokeOpacity="0.55" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
              ),
            )}
            {/* ground */}
            <line x1="0" y1="93" x2="100" y2="93" stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* fracture point marker */}
          <span
            className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${LEGS[WEAK_LEG]}%`,
              top: "62%",
              background: LAB_PINK,
              boxShadow: `0 0 12px ${LAB_PINK}66`,
            }}
          />
        </div>

        {/* ghost numeral */}
        <span className="pointer-events-none absolute bottom-3 left-4 select-none font-mono text-[clamp(4rem,10vw,8rem)] font-medium leading-none text-[var(--depth-3)]">
          07
        </span>

        {/* corner registration marks */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/tl:opacity-100"
          style={{ borderColor: undefined }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30"
        />

        {/* identity — left */}
        <div className="pointer-events-none absolute left-5 top-5 max-w-[58%] md:left-7 md:top-7 md:max-w-[48%]">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·07 — <span style={{ color: LAB_ACCENT }}>Module</span>
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
            A3RO Intelligence
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            Thesis Lab
          </h3>
          <p className="mt-3 hidden text-[13px] leading-relaxed text-[var(--ink-2)] md:block">
            Pressure-test the trade before the market does — assumptions scored
            for fragility, scenarios traced, the book audited against both.
          </p>
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            Extract · score · counter · size
          </p>
        </div>

        {/* shelf readout — right */}
        <div className="pointer-events-none absolute right-5 top-5 flex flex-col items-end text-right md:right-7 md:top-7">
          <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            {!reduced ? (
              <motion.span
                aria-hidden
                className="inline-block h-[5px] w-[5px] rounded-full"
                style={{ background: LAB_ACCENT }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: LAB_ACCENT }} />
            )}
            {monitorText}
          </p>

          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            Theses on file
          </p>
          <p className="mt-1 font-mono text-3xl font-medium tabular-nums tracking-tight text-[var(--ink)] md:text-5xl">
            {shelf.status === "live" ? String(shelf.theses.length).padStart(2, "0") : "——"}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            {shelf.status === "live" && latest
              ? "Latest under test"
              : shelf.status === "empty"
                ? "None saved yet"
                : shelf.status === "setup"
                  ? "Run migrate:thesis"
                  : shelf.status === "error"
                    ? "Feed unreachable"
                    : "Connecting"}
          </p>

          {shelf.status === "live" && latest && (
            <div className="mt-4 w-40 md:mt-5 md:w-48">
              <p className="truncate text-right font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)]">{latest.title}</p>
              <p className="mt-1 font-mono text-[11px] tabular-nums">
                <span style={{ color: verdictColor(latest.verdict ?? "") }}>
                  {latest.strength ?? "—"}/100 · {latest.verdict ?? "—"}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* the one affordance */}
        <p className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-base)] group-hover/tl:text-[var(--ink)] md:bottom-6 md:right-7">
          Open module
          <span
            aria-hidden
            className="inline-block transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/tl:translate-x-1"
            style={{ color: LAB_ACCENT }}
          >
            →
          </span>
        </p>
      </div>

      {/* card footer — directory grammar */}
      <div className="flex items-baseline justify-between gap-4 px-5 py-4 hairline-t">
        <h3 className="text-sm font-medium text-[var(--ink)]">
          A3RO Intelligence — Thesis Lab
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Pressure test → scenarios → risk
        </p>
      </div>
    </a>
  );
}
