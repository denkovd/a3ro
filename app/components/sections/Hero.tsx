"use client";
/* ────────────────────────────────────────────────────────────────
   Hero — pinned arrival scene (170vh).
   Entrance: headline characters rise out of clip masks, staggered.
   While pinned, scroll scrubs the whole scene: title recedes and
   lifts, planes separate, a ghost numeral drifts past. The title
   block tilts a few degrees toward the cursor.
──────────────────────────────────────────────────────────────── */
import { useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { DUR, EASE_OUT, useMounted, useFinePointer } from "../motion";

const LINE_1 = "Quiet signals.";
const LINE_2 = "Hard markets.";

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
            {ch === " " ? " " : ch}
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

  /* Scrubbed exit — the camera pulls back and up */
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -260]);
  const titleScale = useTransform(scrollYProgress, [0, 1], [1, 0.86]);
  const metaY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const horizonY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const ghostY = useTransform(scrollYProgress, [0, 1], [60, -340]);
  const fade = useTransform(scrollYProgress, [0.35, 0.8], [1, 0]);
  const eyebrowFade = useTransform(scrollYProgress, [0.15, 0.5], [1, 0]);

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

        {/* Horizon plane */}
        <motion.div
          aria-hidden
          style={reduced ? undefined : { y: horizonY, opacity: fade }}
          className="absolute inset-x-0 top-[64%]"
        >
          <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-[var(--line-2)] to-transparent" />
        </motion.div>

        {/* Title plane — scrubbed + tilted */}
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
                }
          }
          className="relative z-10 mx-auto w-full max-w-6xl px-6 will-change-transform md:px-10"
        >
          <motion.p
            style={reduced ? undefined : { opacity: eyebrowFade }}
            className="mb-6 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]"
          >
            <motion.span
              className="inline-block"
              initial={reduced ? undefined : { opacity: 0, y: 18 }}
              animate={mounted ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: DUR.reveal, delay: 0.5, ease: EASE_OUT }}
            >
              A3RO · Market Intelligence Platform
            </motion.span>
          </motion.p>

          <h1
            className="font-sans font-extrabold leading-[0.96] tracking-tight"
            aria-label={`${LINE_1} ${LINE_2}`}
          >
            <CharLine text={LINE_1} baseDelay={0.6} mounted={mounted} />
            <CharLine text={LINE_2} baseDelay={0.85} mounted={mounted} dim />
          </h1>

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
            <motion.p
              initial={reduced ? undefined : { opacity: 0 }}
              animate={mounted ? { opacity: 1 } : undefined}
              transition={{ duration: DUR.reveal, delay: 1.6, ease: EASE_OUT }}
              className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]"
            >
              Oil · Gold · BTC — one intelligence layer
            </motion.p>
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
