"use client";
/* Why-now driver chips — max 4, live-only, no prose walls. */
import type { FocusTarget, RailDriver } from "./types";

export default function WhyNowDrivers({
  drivers,
  onFocus,
}: {
  drivers: RailDriver[];
  onFocus?: (target: FocusTarget) => void;
}) {
  return (
    <section aria-label="Why conditions changed">
      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Why now</p>
      {drivers.length === 0 ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
          Awaiting live drivers
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {drivers.map((d) => {
            const interactive = !!d.focus && !!onFocus;
            const className = `flex w-full items-center justify-between gap-3 border border-[var(--line)] px-2.5 py-1.5 text-left ${
              interactive
                ? "transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)] hover:bg-[rgba(232,235,232,0.03)]"
                : ""
            }`;
            const inner = (
              <>
                <span className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                  {d.label}
                </span>
                <span
                  className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink)]"
                  style={d.color ? { color: d.color } : undefined}
                >
                  {d.value}
                </span>
              </>
            );
            return (
              <li key={d.id}>
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => d.focus && onFocus?.(d.focus)}
                    className={className}
                  >
                    {inner}
                  </button>
                ) : (
                  <div className={className}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
