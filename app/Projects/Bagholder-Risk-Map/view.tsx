"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Bagholder-Risk-Map — fullscreen experience shell (P·08)

   Narrative shock → trapped-cohort scoring → trigger/invalidator
   state machine (bagholder-trigger-trade-architecture.md). The Risk
   Map plots every open trigger by positioning/pain vs narrative
   exhaustion, sized by opportunity, colored by trigger state — a
   spatial read of where trapped cohorts currently sit.

   One data hook (/api/bagholder/triggers), curation writes back
   through /api/bagholder/narratives + .../events and rescore
   synchronously. Esc or "Index" returns home.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import TapeBanner from "../../components/projects/TapeBanner";
import BagholderRiskMapCore from "../../components/projects/BagholderRiskMapCore";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import { BH_ACCENT } from "../../components/projects/bagholder/bagholderData";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #1c0f10 0%, var(--depth-1) 55%, #070808 100%)";

export default function BagholderRiskMapView() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
  }, [leaving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  return (
    <motion.main
      className="grain fixed inset-0 overflow-hidden bg-[var(--depth-0)]"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.28, ease: "easeInOut" }}
      onAnimationComplete={() => {
        if (leaving) router.push("/#modules");
      }}
    >
      <div aria-hidden className="absolute inset-0" style={{ background: ATMOSPHERE }} />

      {/* ── top chrome ── */}
      <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <div className="flex items-baseline gap-4">
          <button
            onClick={leave}
            className="sweep font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            aria-label="Close Bagholder Risk Map and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — Bagholder Risk Map
          </p>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <ModuleSwitcher current="bagholder" />
        </div>
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: BH_ACCENT }} />
          Narrative shock · positioning · trigger state machine
        </p>
      </header>

      {/* ── scroll region ── */}
      <div data-lenis-prevent className="absolute inset-x-0 bottom-12 top-14 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:px-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·08 — Intelligence module
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
            Bagholder Risk Map
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-2)]">
            Detects when a narrative shock creates a trapped population of participants and converts it into a
            scored, timed, invalidatable trigger — fade, follow-through, rotation, or delayed mean reversion.
            Deterministic scoring only: every number traces to a listed contribution. Hand-curated narratives,
            live macro/positioning/relative-performance data. Not investment advice.
          </p>

          <TapeBanner className="mt-8" />

          <div className="mt-10">
            <BagholderRiskMapCore />
          </div>
        </div>
      </div>

      {/* ── bottom chrome ── */}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] backdrop-blur-md md:px-10">
        <span>P·08 — Bagholder Risk Map</span>
        <span>Setups scored, not sized — sizing stays your call</span>
      </footer>
    </motion.main>
  );
}
