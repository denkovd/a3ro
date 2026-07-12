"use client";
/* ────────────────────────────────────────────────────────────────
   TapeBanner — the composite headline stance (scores-plan "tape"):
   Flow Stress + Tightness + Macro Override rolled into one verdict
   (SUPPLY-TIGHT / SUPPLY-AMPLE / MACRO-DRIVEN / BALANCED) naming the
   dominant driver. Reads /api/oil/tape. Honest states: pending until
   ≥2 composites are live, quiet on a failed fetch. Self-contained.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

type Driver = { key: string; label: string; value: number | null };
type Tape = {
  runDate: string | null;
  stance: string;
  label: string;
  headline: string;
  drivers: Driver[];
  coverage: number;
};
type State = { status: "loading" | "live" | "pending" | "error"; tape: Tape | null };

const STANCE_COLOR: Record<string, string> = {
  SUPPLY_TIGHT: "#d4a157", // amber — supply-supportive / physically tight
  SUPPLY_AMPLE: "#5fc9a4", // mint — loose / ample
  MACRO_DRIVEN: "#8b9dff", // periwinkle — macro in charge
  BALANCED: "var(--ink-2)",
  PENDING: "var(--ink-3)",
};

export default function TapeBanner({ className = "" }: { className?: string }) {
  const [s, setS] = useState<State>({ status: "loading", tape: null });

  useEffect(() => {
    let alive = true;
    fetch("/api/oil/tape", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!alive) return;
        if (!res.ok || typeof body.error === "string") {
          setS({ status: "error", tape: null });
          return;
        }
        const t = body.tape as Tape | null;
        if (!t || typeof t !== "object" || t.stance === "PENDING") {
          setS({ status: "pending", tape: t ?? null });
          return;
        }
        setS({ status: "live", tape: t });
      })
      .catch(() => {
        if (alive) setS({ status: "error", tape: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (s.status === "error") return null;

  const color = s.tape ? STANCE_COLOR[s.tape.stance] ?? "var(--ink-2)" : "var(--ink-3)";

  return (
    <div className={`rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5 ${className}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
        Composite tape · the headline
      </p>
      {s.status === "loading" ? (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Connecting…</p>
      ) : s.status === "pending" ? (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Awaiting scores — tape lights up once Flow Stress, Tightness and Macro Override read.
        </p>
      ) : (
        s.tape && (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-3xl font-semibold tracking-tight" style={{ color }}>
                {s.tape.label}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                {s.tape.coverage}/3 composites
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-2)]">{s.tape.headline}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {s.tape.drivers.map((d) => (
                <span
                  key={d.key}
                  className="rounded-[3px] border border-[var(--line)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)]"
                >
                  {d.label} {d.value === null ? "·" : d.value}
                </span>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
