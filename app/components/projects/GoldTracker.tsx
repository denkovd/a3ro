"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Gold Tracker · homepage module card (P·02)
   A live intelligence surface: wireframe nugget hero (canvas 2D),
   spot price with horizon changes top right, five signal
   indicators on the left. All data arrives as one GoldSnapshot
   through the data layer (gold/goldData.ts) — mocked JSON today,
   a real gold API later, with zero UI changes.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { useFinePointer } from "../motion";
import GoldNugget, { type NuggetState } from "./gold/GoldNugget";
import {
  useGoldSnapshot,
  formatPrice,
  formatPct,
  formatAsOf,
  CHANGE_ROWS,
  INDICATOR_ROWS,
  GOLD_ACCENT,
} from "./gold/goldData";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 62%, #14120d 0%, var(--depth-1) 55%, #070808 100%)";

export default function GoldTracker({ className = "" }: { className?: string }) {
  const snap = useGoldSnapshot();
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLAnchorElement>(null);
  const nug = useRef<NuggetState>({ tx: 0, ty: 0, hover: 0, par: 0 });

  /* touch devices get a gentle always-on engagement instead of hover */
  useEffect(() => {
    if (!fine) nug.current.hover = 0.55;
  }, [fine]);

  /* scroll parallax → subtle extra pitch on the nugget */
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ["start end", "end start"],
  });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    nug.current.par = (v - 0.5) * 2;
  });

  const pctColor = (v: number) =>
    v > 0 ? GOLD_ACCENT : v < 0 ? "var(--ink-2)" : "var(--ink-3)";

  return (
    <a
      ref={cardRef}
      href="#contact"
      aria-label="Gold Tracker — precious metals intelligence, request platform access"
      onMouseMove={(e) => {
        if (!fine || reduced) return;
        const r = cardRef.current?.getBoundingClientRect();
        if (!r) return;
        nug.current.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        nug.current.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      }}
      onMouseEnter={() => {
        if (fine && !reduced) nug.current.hover = 1;
      }}
      onMouseLeave={() => {
        if (fine) {
          nug.current.hover = 0;
          nug.current.tx = 0;
          nug.current.ty = 0;
        }
      }}
      className={`group/gt relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
    >
      {/* stage */}
      <div className="relative flex-1 overflow-hidden">
        <div aria-hidden className="absolute inset-0" style={{ background: ATMOSPHERE }} />
        {/* time ticks — module grammar */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0px, transparent 47px, var(--line) 48px)",
          }}
        />
        <GoldNugget stateRef={nug} className="absolute inset-0" />

        {/* ghost numeral */}
        <span className="pointer-events-none absolute bottom-3 left-4 select-none font-mono text-[clamp(4rem,10vw,8rem)] font-medium leading-none text-[var(--depth-3)]">
          02
        </span>

        {/* corner registration marks */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/gt:border-[#dcc689] group-hover/gt:opacity-100"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30"
        />

        {/* identity + indicators — left */}
        <div className="pointer-events-none absolute left-5 top-5 max-w-[58%] md:left-7 md:top-7 md:max-w-[46%]">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·02 — <span style={{ color: GOLD_ACCENT }}>Module</span>
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
            A3RO Intelligence
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            Gold Tracker
          </h3>
          <p className="mt-3 hidden text-[13px] leading-relaxed text-[var(--ink-2)] md:block">
            Precious metals intelligence — live spot, macro drivers, and rate
            sensitivity.
          </p>

          <ul className="mt-5 flex flex-col gap-[9px] md:mt-6 md:gap-2.5">
            {INDICATOR_ROWS.map(({ key, label }) => {
              const r = snap.indicators[key];
              const filled = Math.round(r.score * 5);
              return (
                <li key={key} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                    {label}
                  </span>
                  <span aria-hidden className="hidden gap-[3px] md:flex">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="h-[3px] w-3 rounded-full"
                        style={{
                          background:
                            i < filled
                              ? r.bias === 0
                                ? "var(--ink-2)"
                                : GOLD_ACCENT
                              : "var(--line-2)",
                        }}
                      />
                    ))}
                  </span>
                  <span
                    className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em]"
                    style={{ color: r.bias > 0 ? GOLD_ACCENT : "var(--ink-2)" }}
                  >
                    {r.bias > 0 ? "▴ " : r.bias < 0 ? "▾ " : ""}
                    {r.state}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* price block — right */}
        <div className="pointer-events-none absolute right-5 top-5 flex flex-col items-end text-right md:right-7 md:top-7">
          <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            {!reduced ? (
              <motion.span
                aria-hidden
                className="inline-block h-[5px] w-[5px] rounded-full"
                style={{ background: GOLD_ACCENT }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <span
                aria-hidden
                className="inline-block h-[5px] w-[5px] rounded-full"
                style={{ background: GOLD_ACCENT }}
              />
            )}
            Monitor · {snap.source === "live" ? "live feed" : "simulated feed"}
          </p>

          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            XAU / {snap.price.currency} — {snap.price.unit}
          </p>
          <p className="mt-1 font-mono text-3xl font-medium tabular-nums tracking-tight text-[var(--ink)] md:text-5xl">
            {formatPrice(snap.price.value)}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            As of {formatAsOf(snap.asOf)}
          </p>

          <div className="mt-4 w-36 md:mt-5 md:w-44">
            {CHANGE_ROWS.map(({ key, label }, i) => (
              <div
                key={key}
                className={`flex items-baseline justify-between py-[5px] ${
                  i > 0 ? "hairline-t" : ""
                }`}
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  {label}
                </span>
                <span
                  className="font-mono text-[11px] tabular-nums"
                  style={{ color: pctColor(snap.changes[key]) }}
                >
                  {formatPct(snap.changes[key])}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* the one affordance */}
        <p className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-base)] group-hover/gt:text-[var(--ink)] md:bottom-6 md:right-7">
          Request access
          <span
            aria-hidden
            className="inline-block transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/gt:translate-x-1"
            style={{ color: GOLD_ACCENT }}
          >
            →
          </span>
        </p>
      </div>

      {/* card footer — directory grammar */}
      <div className="flex items-baseline justify-between gap-4 px-5 py-4 hairline-t">
        <h3 className="text-sm font-medium text-[var(--ink)]">
          A3RO Intelligence — Gold Tracker
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Precious metals intelligence — private preview
        </p>
      </div>
    </a>
  );
}
