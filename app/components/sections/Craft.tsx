"use client";
/* ────────────────────────────────────────────────────────────────
   Intelligence — capabilities ledger. Rows reveal in sequence. On
   desktop a small preview plate trails the cursor across the list,
   showing the hovered capability's index — depth through motion,
   not decor.
──────────────────────────────────────────────────────────────── */
import { useRef, useState } from "react";
import { motion, useSpring } from "framer-motion";
import {
  CountUp,
  MaskText,
  Parallax,
  Reveal,
  StaggerGroup,
  StaggerItem,
  useFinePointer,
} from "../motion";

/* Platform vitals — derived from the page's own copy */
const STATS = [
  { value: 3, pad: 2, suffix: "", label: "Markets under watch" },
  { value: 5, pad: 2, suffix: "", label: "Intelligence surfaces" },
  { value: 24, pad: 0, suffix: "/7", label: "Signal capture" },
  { value: 1, pad: 2, suffix: "", label: "Intelligence layer" },
];

const CAPABILITIES = [
  {
    id: "01",
    title: "Live monitoring",
    body: "Continuous signal capture across each market, structured into summaries that read in seconds.",
  },
  {
    id: "02",
    title: "Context layers",
    body: "Macro, sentiment, geopolitical, and flow-based inputs — the forces behind a price, attached to the price.",
  },
  {
    id: "03",
    title: "Asset-specific intelligence",
    body: "A distinct signal stack per market. Oil reads corridors and flows. Gold reads rates and havens. Bitcoin reads liquidity and structure.",
  },
  {
    id: "04",
    title: "Decision surfaces",
    body: "Interfaces built for scanning, interpreting, and acting. Nothing on screen without a job.",
  },
];

export default function Craft() {
  const fine = useFinePointer();
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<number | null>(null);

  // Preview plate trails the cursor on springs
  const px = useSpring(0, { stiffness: 140, damping: 20, mass: 0.3 });
  const py = useSpring(0, { stiffness: 140, damping: 20, mass: 0.3 });

  return (
    <section
      ref={sectionRef}
      id="intelligence"
      className="relative z-10 py-[18vh]"
      onMouseMove={(e) => {
        if (!fine) return;
        const r = sectionRef.current?.getBoundingClientRect();
        if (!r) return;
        px.set(e.clientX - r.left);
        py.set(e.clientY - r.top);
      }}
    >
      {/* Ghost numeral — directory grammar, drifting against scroll */}
      <Parallax
        depth={-0.3}
        className="pointer-events-none absolute right-[2%] top-[6%] select-none"
      >
        <span
          aria-hidden
          className="font-mono text-[clamp(8rem,22vw,18rem)] font-medium leading-none text-[var(--depth-2)]"
        >
          02
        </span>
      </Parallax>

      <div className="relative mx-auto max-w-6xl px-6 md:px-10">
        <Reveal>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            02 / Intelligence
          </p>
        </Reveal>
        <h2 className="mb-16 max-w-xl text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
          <MaskText>Four capabilities. One discipline.</MaskText>
        </h2>

        <StaggerGroup>
          <ul className="hairline-t">
            {CAPABILITIES.map((c, i) => (
              <StaggerItem key={c.id}>
                <li
                  className="group hairline-b"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                >
                  <div className="grid grid-cols-[3rem_1fr] gap-4 py-8 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover:translate-x-3 md:grid-cols-[6rem_1fr_1.2fr] md:items-baseline md:gap-8">
                    <span className="font-mono text-xs text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] group-hover:text-[var(--acid)]">
                      {c.id}
                    </span>
                    <h3 className="text-xl font-semibold tracking-tight text-[var(--ink)] transition-colors duration-[var(--dur-micro)] md:text-2xl">
                      {c.title}
                    </h3>
                    <p className="col-start-2 max-w-md text-sm leading-relaxed text-[var(--ink-2)] md:col-start-3">
                      {c.body}
                    </p>
                  </div>
                </li>
              </StaggerItem>
            ))}
          </ul>
        </StaggerGroup>

        {/* Vitals — numbers rise as the band enters frame */}
        <StaggerGroup className="mt-24">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-[var(--line)] hairline md:grid-cols-4">
            {STATS.map((s) => (
              <StaggerItem key={s.label}>
                <div className="flex h-full flex-col gap-3 bg-[var(--depth-1)] px-6 py-8">
                  <CountUp
                    to={s.value}
                    pad={s.pad}
                    suffix={s.suffix}
                    className="font-mono text-4xl font-medium tracking-tight text-[var(--ink)] md:text-5xl"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                    {s.label}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </div>
        </StaggerGroup>
      </div>

      {/* Cursor preview plate — desktop only */}
      {fine && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-20 will-change-transform"
          style={{ x: px, y: py }}
        >
          <motion.div
            className="hairline -translate-y-1/2 translate-x-6 rounded-sm bg-[var(--depth-2)] px-4 py-3"
            initial={false}
            animate={{
              opacity: active === null ? 0 : 1,
              scale: active === null ? 0.9 : 1,
            }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              Capability&nbsp;
            </span>
            <span className="font-mono text-[10px] tracking-[0.25em] text-[var(--acid)]">
              {active !== null ? CAPABILITIES[active].id : ""}
            </span>
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}
