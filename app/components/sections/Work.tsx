"use client";
/* ────────────────────────────────────────────────────────────────
   Work — a pinned lateral traverse. On desktop the section pins
   and vertical scroll drives horizontal travel across the slots,
   like moving along a corridor of windows. On touch/mobile it
   degrades to a vertical stack with inner parallax.
──────────────────────────────────────────────────────────────── */
import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { Reveal, useFinePointer } from "../motion";

const SLOTS = [
  {
    id: "P·01",
    title: "Project placeholder",
    meta: "Operations platform — case study coming soon",
  },
  {
    id: "P·02",
    title: "Project placeholder",
    meta: "AI workflow build — case study coming soon",
  },
  {
    id: "P·03",
    title: "Project placeholder",
    meta: "Product MVP — case study coming soon",
  },
];

/* Shared inner surface: abstract environment, no fake screenshots */
function SlotSurface({
  index,
  innerY,
  innerX,
}: {
  index: number;
  innerY?: MotionValue<number>;
  innerX?: MotionValue<number>;
}) {
  return (
    <motion.div aria-hidden style={{ y: innerY, x: innerX }} className="absolute inset-[-40px] will-change-transform">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 90% at ${index % 2 === 0 ? "22%" : "78%"} 70%, var(--depth-3) 0%, var(--depth-1) 65%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(105deg, transparent 0px, transparent 22px, var(--line) 23px)",
        }}
      />
    </motion.div>
  );
}

function SlotFrame({
  slot,
  index,
  innerY,
  innerX,
  className = "",
}: {
  slot: (typeof SLOTS)[number];
  index: number;
  innerY?: MotionValue<number>;
  innerX?: MotionValue<number>;
  className?: string;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-sm hairline bg-[var(--depth-1)] ${className}`}>
      <div className="relative flex-1 overflow-hidden">
        <SlotSurface index={index} innerY={innerY} innerX={innerX} />
        <span className="pointer-events-none absolute bottom-3 left-4 select-none font-mono text-[clamp(4rem,10vw,8rem)] font-medium leading-none text-[var(--depth-3)]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)] transition-colors duration-[var(--dur-base)] group-hover:text-[var(--ink-2)]">
            {slot.id} — Reserved
          </span>
        </div>
        <span
          aria-hidden
          className="absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover:border-[var(--acid)] group-hover:opacity-100"
        />
      </div>
      <div className="flex items-baseline justify-between px-5 py-4 hairline-t">
        <h3 className="text-sm font-medium text-[var(--ink)]">{slot.title}</h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          {slot.meta}
        </p>
      </div>
    </div>
  );
}

/* Desktop: pinned corridor. Track shifts left as the reader scrolls. */
function WorkTraverse() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  // 3 panels × 62vw + gaps; travel ends with last panel in frame
  const x = useTransform(scrollYProgress, [0.05, 0.95], ["0vw", "-102vw"]);
  const innerX = useTransform(scrollYProgress, [0, 1], [28, -28]);
  const counter = useTransform(scrollYProgress, [0.1, 0.9], [1, SLOTS.length]);
  const counterText = useTransform(counter, (v) => String(Math.round(v)).padStart(2, "0"));

  return (
    <div ref={ref} className="relative h-[320vh]">
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden">
        <div className="mx-auto mb-10 flex w-full max-w-6xl items-end justify-between px-10">
          <div>
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
              03 / Work
            </p>
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
              Selected work, arriving quietly.
            </h2>
          </div>
          <p className="font-mono text-xs tracking-[0.2em] text-[var(--ink-3)]">
            <motion.span className="text-[var(--acid)]">{counterText}</motion.span>
            &nbsp;/&nbsp;{String(SLOTS.length).padStart(2, "0")}
          </p>
        </div>

        <motion.div
          style={{ x }}
          className="flex gap-[6vw] pl-[calc(max((100vw-72rem)/2,0px)+2.5rem)] will-change-transform"
        >
          {SLOTS.map((s, i) => (
            <SlotFrame
              key={s.id}
              slot={s}
              index={i}
              innerX={innerX}
              className="flex h-[52svh] w-[62vw] shrink-0 flex-col"
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/* Mobile / reduced motion: vertical stack, inner parallax per card */
function StackedSlot({ slot, index }: { slot: (typeof SLOTS)[number]; index: number }) {
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
        <SlotFrame
          slot={slot}
          index={index}
          innerY={reduced ? undefined : innerY}
          className="flex aspect-[16/11] flex-col"
        />
      </div>
    </Reveal>
  );
}

function WorkStack() {
  return (
    <div className="mx-auto max-w-6xl px-6 md:px-10">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
        03 / Work
      </p>
      <h2 className="mb-16 max-w-xl text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Selected work, arriving quietly.
      </h2>
      <div className="flex flex-col gap-10">
        {SLOTS.map((s, i) => (
          <StackedSlot key={s.id} slot={s} index={i} />
        ))}
      </div>
    </div>
  );
}

export default function Work() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const traverse = fine && !reduced;
  return (
    <section id="work" className="relative z-10 py-[10vh]">
      {traverse ? <WorkTraverse /> : <WorkStack />}
    </section>
  );
}
