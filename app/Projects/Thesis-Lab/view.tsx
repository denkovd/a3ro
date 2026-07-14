"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Thesis-Lab — fullscreen experience shell (P·07).
   One coherent workflow across four stages sharing state:
     01 Pressure Test  — thesis in, assumptions out (weakest first)
     02 Grill Me       — interrogation loop → decision memo
     03 Scenarios      — five paths, downside first, legs traced
     04 Portfolio Risk — the real book audited against both
   The analyzed thesis flows forward: scenarios are generated from
   it; the risk audit pins its saved id so scenario P&L on the book
   traces to the exact thesis under test. Esc or "Index" returns to
   the homepage. Same shell grammar as the other module pages.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import PressureTest from "../../components/projects/thesis/PressureTest";
import GrillMe from "../../components/projects/thesis/GrillMe";
import ScenarioBoard from "../../components/projects/thesis/ScenarioBoard";
import RiskAudit from "../../components/projects/thesis/RiskAudit";
import { LAB_ACCENT, type LabResult } from "../../components/projects/thesis/thesisData";
import { type GrillSessionState } from "../../components/projects/thesis/grill";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #0a1416 0%, var(--depth-1) 55%, #070808 100%)";

type Stage = "test" | "grill" | "scenarios" | "risk";

const STAGES: { id: Stage; num: string; label: string }[] = [
  { id: "test", num: "01", label: "Pressure Test" },
  { id: "grill", num: "02", label: "Grill Me" },
  { id: "scenarios", num: "03", label: "Scenarios" },
  { id: "risk", num: "04", label: "Portfolio Risk" },
];

export default function ThesisLabView() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("test");
  const [result, setResult] = useState<LabResult | null>(null);
  const [grill, setGrill] = useState<GrillSessionState | null>(null);
  const [leaving, setLeaving] = useState(false);

  /* a fresh analysis invalidates any in-flight interrogation */
  const onResult = useCallback((r: LabResult | null) => {
    setResult(r);
    setGrill(null);
  }, []);

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
            aria-label="Close Thesis Lab and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — Thesis Lab
          </p>
        </div>
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: LAB_ACCENT }} />
          Live context · tape / macro / COT / trend
        </p>
      </header>

      {/* ── scroll region ── */}
      <div data-lenis-prevent className="absolute inset-x-0 bottom-12 top-14 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:px-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·07 — Intelligence module
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
            Thesis Lab
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-2)]">
            Pressure-test a trading thesis against the live tape, generate the scenario paths it lives or dies on,
            and audit the actual book against both. Deterministic scoring — every number carries its receipt.
            Not investment advice.
          </p>

          {/* workflow ribbon */}
          <div className="mt-8 flex items-center gap-1 border-b border-[var(--line)]">
            {STAGES.map((s, i) => {
              const active = stage === s.id;
              const chained = (s.id === "grill" || s.id === "scenarios") && result !== null;
              return (
                <span key={s.id} className="flex items-center">
                  {i > 0 && <span aria-hidden className="mx-2 font-mono text-[10px] text-[var(--ink-3)]">→</span>}
                  <button
                    onClick={() => setStage(s.id)}
                    aria-current={active ? "page" : undefined}
                    className="relative px-2 pb-3 pt-1 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-micro)]"
                    style={{ color: active ? "var(--ink)" : "var(--ink-3)" }}
                  >
                    <span style={{ color: active ? LAB_ACCENT : undefined }}>{s.num}</span> {s.label}
                    {chained && !active && (
                      <span aria-hidden className="absolute -right-0.5 top-0.5 inline-block h-[5px] w-[5px] rounded-full" style={{ background: LAB_ACCENT }} />
                    )}
                    {active && (
                      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px" style={{ background: LAB_ACCENT }} />
                    )}
                  </button>
                </span>
              );
            })}
            {result && (
              <p className="ml-auto hidden pb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)] md:block">
                Under test: {result.analysis.instrumentLabel} · {result.analysis.direction} · {result.analysis.strength}/100
              </p>
            )}
          </div>

          {/* stages */}
          <div className="mt-8">
            {stage === "test" && (
              <PressureTest result={result} onResult={onResult} onOpenScenarios={() => setStage("scenarios")} />
            )}
            {stage === "grill" && (
              <GrillMe result={result} session={grill} onSession={setGrill} onBack={() => setStage("test")} />
            )}
            {stage === "scenarios" && <ScenarioBoard result={result} onBack={() => setStage("test")} />}
            {stage === "risk" && <RiskAudit pinnedThesisId={result?.thesisId ?? null} />}
          </div>
        </div>
      </div>

      {/* ── bottom chrome ── */}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] backdrop-blur-md md:px-10">
        <span>P·07 — Thesis Lab</span>
        <span>Deterministic engine · live context where shown · not investment advice</span>
      </footer>
    </motion.main>
  );
}
