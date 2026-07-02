"use client";
/* ────────────────────────────────────────────────────────────────
   Process — a vertical descent line that draws itself as the
   reader scrolls, with four stations lighting up along the way.
   The line's growth is scroll-driven (scaleY), so progress through
   the section literally is progress through the process.
──────────────────────────────────────────────────────────────── */
import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { Reveal } from "../motion";

const STEPS = [
  {
    num: "01",
    title: "Listen",
    body: "A short call. We map the real problem, not the assumed one.",
  },
  {
    num: "02",
    title: "Scope",
    body: "Fixed scope, honest timeline, one number. No moving targets.",
  },
  {
    num: "03",
    title: "Build",
    body: "Tight sprints with visible progress. You steer while we ship.",
  },
  {
    num: "04",
    title: "Stay",
    body: "Launch is the midpoint. We support, refine, and scale from there.",
  },
];

/* Station dot — hollow until the drawn line passes it, then acid */
function Station({
  progress,
  at,
  reduced,
}: {
  progress: MotionValue<number>;
  at: number;
  reduced: boolean;
}) {
  const fill = useTransform(progress, [at - 0.04, at], [0, 1]);
  const scale = useTransform(progress, [at - 0.04, at], [1, 1.25]);
  return (
    <span
      aria-hidden
      className="absolute -left-8 top-1.5 flex h-[11px] w-[11px] items-center justify-center rounded-full border border-[var(--line-2)] bg-[var(--depth-0)] md:-left-12 md:h-[15px] md:w-[15px]"
    >
      <motion.span
        className="h-[5px] w-[5px] rounded-full md:h-[7px] md:w-[7px]"
        style={{
          background: "var(--acid)",
          opacity: reduced ? 1 : fill,
          scale: reduced ? 1 : scale,
        }}
      />
    </span>
  );
}

export default function Process() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.7", "end 0.7"],
  });

  return (
    <section ref={ref} id="process" className="relative z-10 py-[18vh]">
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          04 / Process
        </p>
        <h2 className="mb-20 max-w-xl text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
          A straight line from call to launch.
        </h2>

        <div className="relative pl-8 md:pl-12">
          {/* Track */}
          <div className="absolute bottom-0 left-[5px] top-0 w-px bg-[var(--line)] md:left-[7px]" />
          {/* Drawn progress — the section's single acid element */}
          <motion.div
            aria-hidden
            className="absolute bottom-0 left-[5px] top-0 w-px origin-top md:left-[7px]"
            style={{
              background: "var(--acid)",
              scaleY: reduced ? 1 : scrollYProgress,
            }}
          />

          <ol className="flex flex-col gap-20">
            {STEPS.map((s, i) => (
              <li key={s.num} className="relative">
                <Station
                  progress={scrollYProgress}
                  at={0.1 + (i / (STEPS.length - 1)) * 0.78}
                  reduced={!!reduced}
                />
                <Reveal delay={i * 0.04}>
                  <div className="grid gap-3 md:grid-cols-[8rem_12rem_1fr] md:items-baseline">
                    <span className="font-mono text-xs text-[var(--ink-3)]">
                      {s.num}
                    </span>
                    <h3 className="text-xl font-semibold tracking-tight text-[var(--ink)]">
                      {s.title}
                    </h3>
                    <p className="max-w-sm text-sm leading-relaxed text-[var(--ink-2)]">
                      {s.body}
                    </p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
