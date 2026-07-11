"use client";
/* ────────────────────────────────────────────────────────────────
   Hero — pinned arrival scene (170vh).
   Entrance: veil lifts onto a perspective grid floor sliding under
   a horizon; the headline characters rise out of clip masks while
   the eyebrow decodes like a feed coming online; a signal trace
   draws itself along the horizon and starts pulsing. One scan band
   sweeps the frame. While pinned, scroll scrubs the exit: the title
   recedes, defocuses (desktop), and the planes separate. Scroll
   velocity leans the headline a few degrees.
──────────────────────────────────────────────────────────────── */
import { useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import {
  DUR,
  EASE_OUT,
  EASE_INOUT,
  DecodeText,
  useMounted,
  useFinePointer,
  useVelocityLean,
} from "../motion";

const LINE_1 = "Quiet signals.";
const LINE_2 = "Hard markets.";

/* Seeded walk — SSR and client draw the same trace */
function walk(seed: number, n: number, vol: number): number[] {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rnd = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  const out: number[] = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * vol;
    v = Math.max(0.12, Math.min(0.88, v));
    out.push(v);
  }
  return out;
}
const TRACE = walk(11, 28, 0.34);
const TRACE_PATH = TRACE.map(
  (v, i) =>
    `${i === 0 ? "M" : "L"}${((i / (TRACE.length - 1)) * 100).toFixed(2)},${(
      (1 - v) * 100
    ).toFixed(2)}`
).join(" ");
const TRACE_LAST = TRACE[TRACE.length - 1];

function CharLine({
  text,
  baseDelay,
  mounted,
  dim,
}: {
  text: string;
  baseDelay: number;
  mounted: boolean;
  dim?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <span
      aria-hidden
      className={`block text-[clamp(2.7rem,9vw,7.5rem)] ${
        dim ? "text-[var(--ink-2)]" : "text-[var(--ink)]"
      }`}
    >
      {text.split("").map((ch, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className="inline-block will-change-transform"
            initial={reduced ? { y: 0 } : { y: "112%" }}
            animate={mounted ? { y: 0 } : undefined}
            transition={{
              duration: 0.8,
              delay: baseDelay + i * 0.028,
              ease: EASE_OUT,
            }}
          >
            {ch === " " ? " " : ch}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const mounted = useMounted();
  const reduced = useReducedMotion();
  const fine = useFinePointer();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  /* Scrubbed exit — the camera pulls back, up, and out of focus */
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -260]);
  const titleScale = useTransform(scrollYProgress, [0, 1], [1, 0.86]);
  const metaY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const horizonY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const ghostY = useTransform(scrollYProgress, [0, 1], [60, -340]);
  const fade = useTransform(scrollYProgress, [0.35, 0.8], [1, 0]);
  const eyebrowFade = useTransform(scrollYProgress, [0.15, 0.5], [1, 0]);
  const exitBlur = useTransform(
    scrollYProgress,
    [0.3, 0.8],
    ["blur(0px)", "blur(10px)"]
  );

  /* Scroll velocity leans the headline — the page has momentum */
  const lean = useVelocityLean(2.6);

  /* Pointer tilt — a few believable degrees, sprung */
  const tiltX = useSpring(0, { stiffness: 60, damping: 18 });
  const tiltY = useSpring(0, { stiffness: 60, damping: 18 });

  return (
    <section
      ref={ref}
      id="top"
      className="relative h-[170vh]"
      onMouseMove={(e) => {
        if (!fine || reduced) return;
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        tiltY.set(nx * 4);
        tiltX.set(ny * -4);
      }}
      onMouseLeave={() => {
        tiltX.set(0);
        tiltY.set(0);
      }}
    >
      <div
        className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden"
        style={{ perspective: 1000 }}
      >
        {/* Ghost numeral — deep background plane, drifts fastest */}
        <motion.span
          aria-hidden
          style={reduced ? undefined : { y: ghostY, opacity: fade }}
          className="pointer-events-none absolute right-[4%] top-[8%] select-none font-mono text-[clamp(10rem,32vw,26rem)] font-medium leading-none text-[var(--depth-3)]"
        >
          01
        </motion.span>

        {/* Grid floor — a perspective plane sliding toward the viewer */}
        <motion.div
          aria-hidden
          style={reduced ? undefined : { y: horizonY, opacity: fade }}
          className="pointer-events-none absolute inset-x-0 bottom-0 top-[63%]"
        >
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              perspective: 460,
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 24%, black 72%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, black 24%, black 72%, transparent 100%)",
            }}
          >
            <motion.div
              className="absolute inset-x-[-35%] top-[-4%] h-[230%] origin-top will-change-transform"
              style={{ rotateX: 74 }}
              initial={reduced ? undefined : { opacity: 0 }}
              animate={mounted ? { opacity: 1 } : undefined}
              transition={{ duration: DUR.scene, delay: 1.1, ease: EASE_INOUT }}
            >
              <motion.div
                className="absolute inset-[-72px]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, var(--line-2) 0 1px, transparent 1px 72px), repeating-linear-gradient(0deg, var(--line-2) 0 1px, transparent 1px 72px)",
                }}
                animate={reduced ? undefined : { y: [0, 72] }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          </div>
        </motion.div>

        {/* Horizon plane + self-drawing signal trace */}
        <motion.div
          aria-hidden
          style={reduced ? undefined : { y: horizonY, opacity: fade }}
          className="absolute inset-x-0 top-[64%]"
        >
          <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-[var(--line-2)] to-transparent" />
          <div className="pointer-events-none relative mx-auto h-16 max-w-6xl -translate-y-1/2 px-6 md:px-10">
            <svg
              className="h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <motion.path
                d={TRACE_PATH}
                fill="none"
                stroke="var(--acid)"
                strokeOpacity="0.5"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
                animate={mounted ? { pathLength: 1 } : undefined}
                transition={{ duration: 1.8, delay: 1.5, ease: EASE_INOUT }}
              />
            </svg>
            {/* terminal marker — lights once the trace arrives, then breathes */}
            <motion.span
              className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: "calc(100% - 1.5rem)",
                top: `${(1 - TRACE_LAST) * 100}%`,
                background: "var(--acid)",
                boxShadow: "0 0 12px var(--acid-dim)",
              }}
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={
                mounted
                  ? reduced
                    ? { opacity: 1 }
                    : { opacity: [0, 1, 0.35, 1] }
                  : undefined
              }
              transition={{
                delay: 3.2,
                duration: 2.4,
                repeat: reduced ? 0 : Infinity,
                ease: "easeInOut",
              }}
            />
          </div>
        </motion.div>

        {/* Scan band — one pass down the frame after the veil lifts */}
        {!reduced && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40 will-change-transform"
            style={{
              background:
                "linear-gradient(to bottom, transparent, rgba(232,235,232,0.045), transparent)",
            }}
            initial={{ y: "-30vh", opacity: 0 }}
            animate={
              mounted ? { y: "110vh", opacity: [0, 1, 1, 0] } : undefined
            }
            transition={{ duration: 1.6, delay: 1.0, ease: EASE_INOUT }}
          />
        )}

        {/* Title plane — scrubbed, tilted, velocity-leaned, defocused on exit */}
        <motion.div
          style={
            reduced
              ? undefined
              : {
                  y: titleY,
                  scale: titleScale,
                  opacity: fade,
                  rotateX: tiltX,
                  rotateY: tiltY,
                  transformStyle: "preserve-3d",
                  ...(fine ? { filter: exitBlur } : {}),
                }
          }
          className="relative z-10 mx-auto w-full max-w-6xl px-6 will-change-transform md:px-10"
        >
          <motion.p
            style={reduced ? undefined : { opacity: eyebrowFade }}
            className="mb-6 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]"
          >
            <DecodeText
              text="A3RO · Market Intelligence Platform"
              delay={0.5}
              duration={1.2}
            />
          </motion.p>

          <motion.h1
            className="font-sans font-extrabold leading-[0.96] tracking-tight will-change-transform"
            aria-label={`${LINE_1} ${LINE_2}`}
            style={reduced ? undefined : { skewX: lean }}
          >
            <CharLine text={LINE_1} baseDelay={0.6} mounted={mounted} />
            <CharLine text={LINE_2} baseDelay={0.85} mounted={mounted} dim />
          </motion.h1>

          <motion.p
            initial={reduced ? undefined : { opacity: 0, y: 22 }}
            animate={mounted ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: DUR.reveal, delay: 1.35, ease: EASE_OUT }}
            className="mt-8 max-w-md text-base leading-relaxed text-[var(--ink-2)]"
          >
            Intelligence for oil, gold, and bitcoin — monitoring live pressure
            across physical and digital markets. Visibility, not clutter.
          </motion.p>
        </motion.div>

        {/* Meta rail — nearest plane */}
        <motion.div
          style={reduced ? undefined : { y: metaY, opacity: fade }}
          className="absolute inset-x-0 bottom-0 z-10"
        >
          <div className="mx-auto flex max-w-6xl items-end justify-between px-6 pb-8 md:px-10">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              <DecodeText
                text="Oil · Gold · BTC — one intelligence layer"
                delay={1.7}
                duration={1.0}
              />
            </p>
            <div className="flex flex-col items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
                Scroll
              </span>
              <div className="relative h-10 w-px overflow-hidden bg-[var(--line)]">
                {!reduced && (
                  <motion.span
                    className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                    style={{ background: "var(--acid)" }}
                    animate={{ y: [-8, 44] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      ease: EASE_OUT,
                      repeatDelay: 0.6,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
