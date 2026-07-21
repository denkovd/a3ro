"use client";
/* ────────────────────────────────────────────────────────────────
   Modules — a pinned lateral traverse across the platform's seven
   intelligence surfaces. On desktop the section pins and vertical
   scroll drives horizontal travel, like moving along a corridor
   of monitors. On touch/mobile it degrades to a vertical stack
   with inner parallax.

   Live surfaces: P·01 Oil Tracker (featured), P·02 Gold Tracker,
   P·03 BTC Tracker (location + flow globe), P·05 Bull Market Finder,
   P·06 Regime Shift Finder (Darius-Dale GRID) and
   P·08 Earnings Beat Leaderboard (surprise → streak → rank).
   P·04 merged into P·05 (strategy lenses) — see
   bull-finder-unified-architecture.md.

   ARCHIVED (hidden from main, not deleted): P·07 Thesis Lab
   (import + render sites commented out below).

   TRAVERSE MATH — keep these three in sync when adding a card:
   • SURFACES = total cards (featured + module cards)
   • TRAVEL_VW = 248 + 68 × (SURFACES − 5)  (each card = 62vw + 6vw gap)
   • runway h-[…vh] ≈ 120vh per surface (pacing of the pin)
──────────────────────────────────────────────────────────────── */
import { useRef, type CSSProperties } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { MaskText, Reveal, useFinePointer } from "../motion";
import OilTracker from "../projects/OilTracker";
import GoldTracker from "../projects/GoldTracker";
import BtcTracker from "../projects/BtcTracker";
import BullFinder from "../projects/BullFinder";
import RegimeShiftFinder from "../projects/RegimeShiftFinder";
// ARCHIVED — Thesis Lab hidden from main modules, not deleted (see note above).
// import ThesisLab from "../projects/ThesisLab";
import EarningsBeat from "../projects/EarningsBeat";

/* ── deterministic signal trace — seeded, so SSR and client agree ── */
function walk(seed: number, n: number, vol: number, drift: number): number[] {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rnd = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  const out: number[] = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * vol + drift;
    v = Math.max(0.08, Math.min(0.92, v));
    out.push(v);
  }
  return out;
}

const toPath = (vals: number[]) =>
  vals
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${((i / (vals.length - 1)) * 100).toFixed(2)},${((1 - v) * 100).toFixed(2)}`
    )
    .join(" ");

/* Static placeholder module cards (none live today). Live components
   are mounted explicitly below — Oil, Gold, BTC, Bull, Regime, Earnings. */
const MODULES: {
  id: string;
  name: string;
  accent: string;
  desc: string;
  detail: string;
  stack: string;
  footerMeta: string;
  trace: number[];
}[] = [];
type Module = (typeof MODULES)[number];

/* Oil + Gold + BTC + Bull + Regime Shift + Earnings Beat
   (Thesis Lab archived — see notes above) */
const SURFACES = MODULES.length + 6;
/* 72vw featured + (SURFACES−1) × 62vw + 6vw gaps; travel ends with the
   last panel in frame: 248vw at 5 surfaces, +68vw per extra card. */
const TRAVEL_VW = 248 + 68 * (SURFACES - 5);

/* Shared inner surface: depth field, time ticks, one signal trace */
function ModuleSurface({
  module: m,
  index,
  innerY,
  innerX,
}: {
  module: Module;
  index: number;
  innerY?: MotionValue<number>;
  innerX?: MotionValue<number>;
}) {
  const last = m.trace[m.trace.length - 1];
  return (
    <motion.div
      aria-hidden
      style={{ y: innerY, x: innerX }}
      className="absolute inset-[-40px] will-change-transform"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 90% at ${index % 2 === 0 ? "22%" : "78%"} 70%, var(--depth-3) 0%, var(--depth-1) 65%)`,
        }}
      />
      {/* time ticks — map-like verticals */}
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0px, transparent 47px, var(--line) 48px)",
        }}
      />
      {/* signal trace + watch level */}
      <div className="absolute inset-x-12 bottom-12 top-[54%]">
        <svg
          className="h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            d={`${toPath(m.trace)} L100,100 L0,100 Z`}
            fill={m.accent}
            fillOpacity="0.05"
            stroke="none"
          />
          <path
            d={toPath(m.trace)}
            fill="none"
            stroke={m.accent}
            strokeOpacity="0.55"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="0"
            x2="100"
            y1={(1 - last) * 100}
            y2={(1 - last) * 100}
            stroke={m.accent}
            strokeOpacity="0.18"
            strokeWidth="1"
            strokeDasharray="0.8 1.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* terminal marker — stays round while the svg stretches */}
        <span
          className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: "100%",
            top: `${(1 - last) * 100}%`,
            background: m.accent,
            boxShadow: `0 0 12px ${m.accent}55`,
          }}
        />
      </div>
    </motion.div>
  );
}

function ModuleFrame({
  module: m,
  index,
  innerY,
  innerX,
  className = "",
}: {
  module: Module;
  index: number;
  innerY?: MotionValue<number>;
  innerX?: MotionValue<number>;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <a
      href="#contact"
      aria-label={`${m.name} — request platform access`}
      style={{ "--mod": m.accent } as CSSProperties}
      className={`group relative overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
    >
      <div className="relative flex-1 overflow-hidden">
        <ModuleSurface module={m} index={index} innerY={innerY} innerX={innerX} />

        {/* ghost numeral — directory grammar */}
        <span className="pointer-events-none absolute bottom-3 left-4 select-none font-mono text-[clamp(4rem,10vw,8rem)] font-medium leading-none text-[var(--depth-3)]">
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* corner registration marks */}
        <span
          aria-hidden
          className="absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover:border-[var(--mod)] group-hover:opacity-100"
        />
        <span
          aria-hidden
          className="absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30"
        />

        {/* identity */}
        <div className="pointer-events-none absolute left-5 top-5 max-w-[80%] md:left-7 md:top-7 md:max-w-[46%]">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            {m.id} — <span style={{ color: m.accent }}>Module</span>
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
            A3RO Intelligence
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            {m.name}
          </h3>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
            {m.desc}
          </p>
          <p className="mt-2 hidden text-xs leading-relaxed text-[var(--ink-3)] md:block">
            {m.detail}
          </p>
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            {m.stack}
          </p>
        </div>

        {/* feed status */}
        <p className="pointer-events-none absolute right-5 top-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] md:right-7 md:top-7">
          {!reduced ? (
            <motion.span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: m.accent }}
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: m.accent }}
            />
          )}
          Monitor · private preview
        </p>

        {/* the one affordance */}
        <p className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-base)] group-hover:text-[var(--ink)] md:bottom-6 md:right-7">
          Request access
          <span
            aria-hidden
            className="inline-block transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover:translate-x-1"
            style={{ color: m.accent }}
          >
            →
          </span>
        </p>
      </div>

      {/* card footer — matches the directory grammar */}
      <div className="flex items-baseline justify-between gap-4 px-5 py-4 hairline-t">
        <h3 className="text-sm font-medium text-[var(--ink)]">
          A3RO Intelligence — {m.name}
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          {m.footerMeta}
        </p>
      </div>
    </a>
  );
}

/* Desktop: pinned corridor. Track shifts left as the reader scrolls. */
function ModulesTraverse() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const x = useTransform(scrollYProgress, [0.05, 0.95], ["0vw", `-${TRAVEL_VW}vw`]);
  const innerX = useTransform(scrollYProgress, [0, 1], [28, -28]);
  const counter = useTransform(scrollYProgress, [0.1, 0.9], [1, SURFACES]);
  const counterText = useTransform(counter, (v) => String(Math.round(v)).padStart(2, "0"));

  return (
    <div ref={ref} className="relative h-[960vh]">
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden">
        <div className="mx-auto mb-10 flex w-full max-w-6xl items-end justify-between px-10">
          <div>
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
              03 / Modules
            </p>
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
              <MaskText>One platform. Six intelligence surfaces.</MaskText>
            </h2>
          </div>
          <p className="font-mono text-xs tracking-[0.2em] text-[var(--ink-3)]">
            <motion.span className="text-[var(--acid)]">{counterText}</motion.span>
            &nbsp;/&nbsp;{String(SURFACES).padStart(2, "0")}
          </p>
        </div>

        <motion.div
          style={{ x }}
          className="flex items-center gap-[6vw] pl-[calc(max((100vw-72rem)/2,0px)+2.5rem)] will-change-transform"
        >
          <OilTracker className="h-[62svh] w-[72vw] shrink-0" />
          <GoldTracker className="flex h-[52svh] w-[62vw] shrink-0 flex-col" />
          <BtcTracker className="flex h-[52svh] w-[62vw] shrink-0 flex-col" />
          {MODULES.map((m, i) => (
            <ModuleFrame
              key={m.id}
              module={m}
              index={i + 3}
              innerX={innerX}
              className="flex h-[52svh] w-[62vw] shrink-0 flex-col"
            />
          ))}
          <BullFinder className="flex h-[52svh] w-[62vw] shrink-0 flex-col" />
          <RegimeShiftFinder className="flex h-[52svh] w-[62vw] shrink-0 flex-col" />
          {/* ARCHIVED — Thesis Lab hidden from main, not deleted (see note at top of file).
          <ThesisLab className="flex h-[52svh] w-[62vw] shrink-0 flex-col" />
          */}
          <EarningsBeat className="flex h-[52svh] w-[62vw] shrink-0 flex-col" />
        </motion.div>
      </div>
    </div>
  );
}

/* Mobile / reduced motion: vertical stack, inner parallax per card */
function StackedModule({ module: m, index }: { module: Module; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const innerY = useTransform(scrollYProgress, [0, 1], [-30, 30]);
  return (
    <Reveal delay={index * 0.05}>
      <div ref={ref}>
        <ModuleFrame
          module={m}
          index={index}
          innerY={reduced ? undefined : innerY}
          className="flex min-h-[460px] flex-col"
        />
      </div>
    </Reveal>
  );
}

function ModulesStack() {
  return (
    <div className="mx-auto max-w-6xl px-6 md:px-10">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
        03 / Modules
      </p>
      <h2 className="mb-16 max-w-xl text-3xl font-semibold tracking-tight text-[var(--ink)]">
        <MaskText>One platform. Six intelligence surfaces.</MaskText>
      </h2>
      <div className="flex flex-col gap-10">
        <Reveal>
          <OilTracker className="min-h-[560px] md:min-h-[620px]" />
        </Reveal>
        <Reveal delay={0.05}>
          <GoldTracker className="flex min-h-[560px] flex-col" />
        </Reveal>
        <Reveal delay={0.1}>
          <BtcTracker className="flex min-h-[560px] flex-col" />
        </Reveal>
        {MODULES.map((m, i) => (
          <StackedModule key={m.id} module={m} index={i + 3} />
        ))}
        <Reveal delay={0.15}>
          <BullFinder className="flex min-h-[560px] flex-col" />
        </Reveal>
        <Reveal delay={0.2}>
          <RegimeShiftFinder className="flex min-h-[560px] flex-col" />
        </Reveal>
        {/* ARCHIVED — Thesis Lab hidden from main, not deleted (see note at top of file).
        <Reveal delay={0.25}>
          <ThesisLab className="flex min-h-[560px] flex-col" />
        </Reveal>
        */}
        <Reveal delay={0.3}>
          <EarningsBeat className="flex min-h-[560px] flex-col" />
        </Reveal>
      </div>
    </div>
  );
}

export default function Work() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const traverse = fine && !reduced;
  return (
    <section id="modules" className="relative z-10 py-[10vh]">
      {traverse ? <ModulesTraverse /> : <ModulesStack />}
    </section>
  );
}
