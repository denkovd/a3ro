"use client";
/* Compact composite-tape stance for the intel rail. */
import { AMBER_CSS } from "../oilTrackerShared";
import { STANCE_COLOR, type StanceView } from "./types";

export default function StanceBlock({ stance }: { stance: StanceView }) {
  if (stance.status === "error") {
    return (
      <section aria-label="Composite stance">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Stance</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Tape unreachable
        </p>
      </section>
    );
  }

  if (stance.status === "loading") {
    return (
      <section aria-label="Composite stance">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Stance</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Connecting…
        </p>
      </section>
    );
  }

  if (stance.status === "pending") {
    return (
      <section aria-label="Composite stance">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Stance</p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
          Pending composites
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
          Lights up once Flow Stress, Tightness and Macro Override read.
        </p>
      </section>
    );
  }

  const color = STANCE_COLOR[stance.stance] ?? "var(--ink-2)";

  return (
    <section aria-label="Composite stance">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Stance</p>
        <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          {stance.coverage}/3
        </p>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight" style={{ color }}>
        {stance.label}
      </p>
      {stance.headline && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-2)]">{stance.headline}</p>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-[5px] w-[5px] rounded-full"
          style={{ background: color === "var(--ink-2)" ? AMBER_CSS : color }}
        />
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Composite tape
        </span>
      </div>
    </section>
  );
}
