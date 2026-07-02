"use client";
/* ────────────────────────────────────────────────────────────────
   Contact — resolution. Headline lines rise out of masks, the
   email leans toward the cursor, and the room dims back toward
   the black the page opened from.
──────────────────────────────────────────────────────────────── */
import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { MaskText, Magnetic, Reveal } from "../motion";

export default function Contact() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });
  const dim = useTransform(scrollYProgress, [0, 1], [0, 0.5]);
  const rise = useTransform(scrollYProgress, [0, 0.6], [60, 0]);

  return (
    <section
      ref={ref}
      id="contact"
      className="relative z-10 flex min-h-[90svh] flex-col justify-between pt-[20vh]"
    >
      {!reduced && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "#000", opacity: dim }}
        />
      )}

      <motion.div
        style={reduced ? undefined : { y: rise }}
        className="relative mx-auto w-full max-w-6xl px-6 will-change-transform md:px-10"
      >
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          05 / Contact
        </p>
        <h2 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-[var(--ink)] md:text-6xl">
          <MaskText>Tell us what keeps breaking.</MaskText>
          <MaskText delay={0.12}>We&rsquo;ll build the thing that doesn&rsquo;t.</MaskText>
        </h2>
        <Reveal delay={0.3}>
          <Magnetic strength={0.3} className="mt-10">
            <a
              href="mailto:hello@a3ro.com.au"
              className="sweep inline-block py-2 font-mono text-sm tracking-[0.15em] text-[var(--ink)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--acid)]"
            >
              hello@a3ro.com.au
            </a>
          </Magnetic>
        </Reveal>
      </motion.div>

      <footer className="relative mt-[16vh] hairline-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 md:flex-row md:items-center md:justify-between md:px-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO — Sydney, Australia
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            © {new Date().getFullYear()} A3RO. All rights reserved.
          </p>
        </div>
      </footer>
    </section>
  );
}
