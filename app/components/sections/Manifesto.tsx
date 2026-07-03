"use client";
/* ────────────────────────────────────────────────────────────────
   Manifesto — pinned scene (220vh). The statement holds centre
   frame while scroll illuminates it word by word; a counter and
   micro progress bar track the pass. Scroll IS the animation.
──────────────────────────────────────────────────────────────── */
import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";

const STATEMENT =
  "Most market data is noise. Ours is signal — three markets, one intelligence layer, built to read price pressure, corridor risk, and structural change.";

function Word({
  word,
  progress,
  range,
}: {
  word: string;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.12, 1]);
  const y = useTransform(progress, range, [8, 0]);
  return (
    <motion.span style={{ opacity, y }} className="inline-block will-change-transform">
      {word}&nbsp;
    </motion.span>
  );
}

export default function Manifesto() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  // Words light across the middle of the pin; scene eases in/out at edges
  const wordsProgress = useTransform(scrollYProgress, [0.08, 0.85], [0, 1]);
  const sceneIn = useTransform(scrollYProgress, [0, 0.08], [0.4, 1]);
  const barScale = useTransform(scrollYProgress, [0.08, 0.85], [0, 1]);

  const words = STATEMENT.split(" ");

  return (
    <section ref={ref} id="platform" className="relative z-10 h-[220vh]">
      <motion.div
        style={reduced ? undefined : { opacity: sceneIn }}
        className="sticky top-0 flex h-[100svh] items-center"
      >
        <div className="mx-auto w-full max-w-4xl px-6 md:px-10">
          <div className="mb-10 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
              01 / Platform
            </p>
            {/* Micro progress: this scene's own read-through */}
            <div className="relative h-px w-24 bg-[var(--line)]">
              <motion.span
                className="absolute inset-0 origin-left"
                style={{
                  background: "var(--acid)",
                  scaleX: reduced ? 1 : barScale,
                }}
              />
            </div>
          </div>
          <p
            aria-label={STATEMENT}
            className="text-balance text-3xl font-semibold leading-snug tracking-tight text-[var(--ink)] md:text-5xl md:leading-[1.2]"
          >
            {reduced
              ? STATEMENT
              : words.map((w, i) => (
                  <Word
                    key={i}
                    word={w}
                    progress={wordsProgress}
                    range={[
                      i / words.length,
                      Math.min(1, (i + 2) / words.length),
                    ]}
                  />
                ))}
          </p>
        </div>
      </motion.div>
    </section>
  );
}
