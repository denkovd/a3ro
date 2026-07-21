"use client";
/* Always-visible WTI / Brent / spread strip. */
import { formatPctSigned, formatUsdBbl } from "../oilFormat";
import { AMBER_CSS } from "../oilTrackerShared";
import type { BenchmarkRow, SpreadView } from "./types";
import type { Benchmark } from "@a3ro/oil-backend";

export default function BenchmarkStrip({
  benchmarks,
  spread,
  selected,
  onSelect,
}: {
  benchmarks: BenchmarkRow[];
  spread: SpreadView | null;
  selected: Benchmark | null;
  onSelect: (b: Benchmark) => void;
}) {
  return (
    <section aria-label="Oil benchmarks">
      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Benchmarks</p>
      <ul className="mt-1.5 flex flex-col">
        {benchmarks.map((b) => {
          const isSel = selected === b.id;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onSelect(b.id)}
                aria-label={`Open ${b.title} detail`}
                aria-pressed={isSel}
                className={`flex w-full items-center justify-between gap-2 border-l px-2.5 py-[7px] text-left transition-colors duration-[var(--dur-micro)] ${
                  isSel
                    ? "border-[#d4a157] bg-[rgba(212,161,87,0.08)]"
                    : "border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[rgba(232,235,232,0.03)]"
                }`}
              >
                <div className="min-w-0">
                  <p
                    className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
                      isSel ? "text-[var(--ink)]" : "text-[var(--ink-2)]"
                    }`}
                  >
                    {b.id}
                  </p>
                  <p className="mt-0.5 flex items-baseline gap-2">
                    <span className="font-mono text-[13px] text-[var(--ink)]">
                      {b.price != null ? formatUsdBbl(b.price) : "—"}
                    </span>
                    {b.changePct != null && (
                      <span
                        className="font-mono text-[9px] tracking-[0.1em]"
                        style={{ color: b.changePct < 0 ? "var(--ink-3)" : "var(--ink-2)" }}
                        title={
                          b.changeVsDate
                            ? `vs settlement close ${b.changeVsDate}`
                            : "vs prior settlement close"
                        }
                      >
                        {formatPctSigned(b.changePct)}
                        {b.changeVsDate ? (
                          <span className="ml-1 text-[8px] text-[var(--ink-3)]">
                            vs {b.changeVsDate.slice(5)}
                          </span>
                        ) : null}
                      </span>
                    )}
                    {b.suspect && (
                      <span className="font-mono text-[8px] uppercase tracking-[0.12em]" style={{ color: AMBER_CSS }}>
                        SUS
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className="shrink-0 font-mono text-[8px] uppercase tracking-[0.18em]"
                  style={{ color: b.statusColor }}
                >
                  {b.statusText}
                </span>
              </button>
            </li>
          );
        })}
        {spread && (
          <li>
            <div className="flex items-center justify-between gap-2 border-l border-[var(--line)] px-2.5 py-[7px]">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Spread B–W</p>
              <p
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink)]"
                style={spread.label !== "NORMAL" ? { color: AMBER_CSS } : undefined}
              >
                {spread.value >= 0 ? "+" : "−"}${Math.abs(spread.value).toFixed(2)} · {spread.label}
              </p>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}
