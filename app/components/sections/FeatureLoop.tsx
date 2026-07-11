"use client";
/* ────────────────────────────────────────────────────────────────
   Index — the endless feature wall. A pinned scene (300vh) where
   two columns of platform capabilities wrap seamlessly: scroll
   drives them, and they keep drifting on their own when the reader
   stops — the feed never stops. Column A travels up, column B down.
   Wrap math: each column renders three copies of its set and
   translates by offset modulo one set-height, so the loop has no
   seam and no end.

   Mobile: one column, same loop. Reduced motion: a static grid.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { MaskText, Reveal, wrap, useFinePointer } from "../motion";

type Feature = { id: string; title: string; desc: string };

const FEATURES_A: Feature[] = [
  {
    id: "F·01",
    title: "Live price pressure",
    desc: "Continuous pressure reads across spot, curve, and flow.",
  },
  {
    id: "F·02",
    title: "Corridor risk",
    desc: "Chokepoints and shipping corridors scored as conditions shift.",
  },
  {
    id: "F·03",
    title: "Regime detection",
    desc: "Bull, bear, or transition — the market's state, named.",
  },
  {
    id: "F·04",
    title: "Haven flows",
    desc: "Where capital hides: gold, rates, and the dollar in one read.",
  },
  {
    id: "F·05",
    title: "Funding & liquidity",
    desc: "Depth, leverage, and funding stress across digital markets.",
  },
  {
    id: "F·06",
    title: "Macro overlays",
    desc: "Rates, inflation, positioning — context attached to price.",
  },
  {
    id: "F·07",
    title: "Sentiment structure",
    desc: "Headline flow filtered into signal, weighted by source.",
  },
];

const FEATURES_B: Feature[] = [
  {
    id: "F·08",
    title: "Structural alerts",
    desc: "Quiet until something breaks pattern. Then loud enough.",
  },
  {
    id: "F·09",
    title: "Signal summaries",
    desc: "Each session compressed into a read of seconds, not hours.",
  },
  {
    id: "F·10",
    title: "Precedent matching",
    desc: "Today's tape against history's — and what happened next.",
  },
  {
    id: "F·11",
    title: "Positioning reads",
    desc: "Who's long, who's trapped, and where the exits crowd.",
  },
  {
    id: "F·12",
    title: "Flow tracing",
    desc: "Physical cargoes and on-chain movement, one grammar.",
  },
  {
    id: "F·13",
    title: "Watch levels",
    desc: "Levels that matter, held on screen until they act.",
  },
  {
    id: "F·14",
    title: "One layer",
    desc: "Three markets, one place to look. Nothing else on screen.",
  },
];

const ALL_FEATURES = [...FEATURES_A, ...FEATURES_B];

function FeatureRow({ f }: { f: Feature }) {
  return (
    <div className="group hairline-b py-6">
      <div className="flex items-baseline gap-5 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover:translate-x-2">
        <span className="shrink-0 font-mono text-[10px] tracking-[0.2em] text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] group-hover:text-[var(--acid)]">
          {f.id}
        </span>
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-[var(--ink)] md:text-xl">
            {f.title}
          </h3>
          <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-[var(--ink-2)]">
            {f.desc}
          </p>
        </div>
      </div>
    </div>
  );
}

/* One seamless column: three copies of its set, offset wrapped by
   one set-height. reverse=true travels downward. */
function LoopColumn({
  items,
  source,
  reverse = false,
  speed = 1,
}: {
  items: Feature[];
  source: MotionValue<number>;
  reverse?: boolean;
  speed?: number;
}) {
  const setRef = useRef<HTMLDivElement>(null);
  const [setH, setSetH] = useState(0);

  useEffect(() => {
    const el = setRef.current;
    if (!el) return;
    const measure = () => setSetH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const y = useTransform(source, (v) => {
    if (!setH) return 0;
    return -wrap(0, setH, (reverse ? -v : v) * speed);
  });

  return (
    <div className="relative h-full overflow-hidden">
      <motion.div
        style={{ y }}
        className="absolute inset-x-0 top-0 will-change-transform"
      >
        <div ref={setRef}>
          {items.map((f) => (
            <FeatureRow key={f.id} f={f} />
          ))}
        </div>
        {/* seam copies — presentation only */}
        <div aria-hidden>
          {items.map((f) => (
            <FeatureRow key={`${f.id}-b`} f={f} />
          ))}
        </div>
        <div aria-hidden>
          {items.map((f) => (
            <FeatureRow key={`${f.id}-c`} f={f} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function LoopScene() {
  const ref = useRef<HTMLElement>(null);
  const fine = useFinePointer();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  /* Scroll drives the wall… */
  const base = useTransform(scrollYProgress, [0, 1], [0, 2200]);
  /* …and an idle drift keeps it alive when the reader stops. */
  const drift = useMotionValue(0);
  useAnimationFrame((_, delta) => {
    drift.set(drift.get() + (delta / 1000) * 26);
  });
  const source = useTransform<number, number>(
    [base, drift],
    ([b, d]) => b + d
  );

  return (
    <section ref={ref} id="index" className="relative z-10 h-[300vh]">
      <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden pb-4 pt-24 md:pt-28">
        <div className="mx-auto mb-8 flex w-full max-w-6xl items-end justify-between px-6 md:px-10">
          <div>
            <Reveal>
              <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
                05 / Index
              </p>
            </Reveal>
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
              <MaskText>The feed never stops.</MaskText>
            </h2>
          </div>
          <div className="hidden flex-col items-end gap-1 md:flex">
            <span
              aria-hidden
              className="font-mono text-2xl leading-none text-[var(--ink-2)]"
            >
              ∞
            </span>
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              Endless index — loops with scroll
            </p>
          </div>
        </div>

        {/* The wall — rows surface from darkness and return to it */}
        <div
          className="mx-auto w-full max-w-6xl flex-1 px-6 md:px-10"
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
          }}
        >
          {fine ? (
            <div className="grid h-full grid-cols-2 gap-x-16">
              <LoopColumn items={FEATURES_A} source={source} />
              <LoopColumn
                items={FEATURES_B}
                source={source}
                reverse
                speed={0.75}
              />
            </div>
          ) : (
            <div className="h-full">
              <LoopColumn items={ALL_FEATURES} source={source} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* Reduced motion: the same index, settled — a plain two-column grid */
function StaticIndex() {
  return (
    <section id="index" className="relative z-10 py-[18vh]">
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          05 / Index
        </p>
        <h2 className="mb-16 max-w-xl text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
          The feed never stops.
        </h2>
        <div className="grid gap-x-16 md:grid-cols-2">
          {ALL_FEATURES.map((f) => (
            <FeatureRow key={f.id} f={f} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function FeatureLoop() {
  const reduced = useReducedMotion();
  return reduced ? <StaticIndex /> : <LoopScene />;
}
