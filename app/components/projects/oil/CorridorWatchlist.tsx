"use client";
/* Ranked corridor watchlist — persistent, stress-first. */
import { flowHealth } from "../oilTrackerShared";
import type { CorridorWatchRow } from "./types";

export default function CorridorWatchlist({
  corridors,
  selectedId,
  onSelect,
}: {
  corridors: CorridorWatchRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-label="Corridor watchlist">
      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Corridors</p>
      <ul className="mt-1.5 flex flex-col">
        {corridors.map((c) => {
          const isSel = selectedId === c.id;
          const healthColor =
            c.healthRatio != null && Number.isFinite(c.healthRatio) ? flowHealth(c.healthRatio) : null;
          const mute = c.status === "watchlist" || c.status === "connecting";
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-pressed={isSel}
                className={`flex w-full items-center justify-between gap-2 border-l px-2.5 py-[7px] text-left transition-colors duration-[var(--dur-micro)] ${
                  isSel
                    ? "border-[#d4a157] bg-[rgba(212,161,87,0.08)]"
                    : "border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[rgba(232,235,232,0.03)]"
                }`}
              >
                <div className="min-w-0">
                  <p
                    className={`truncate font-mono text-[10px] uppercase tracking-[0.15em] ${
                      isSel ? "text-[var(--ink)]" : mute ? "text-[var(--ink-3)]" : "text-[var(--ink-2)]"
                    }`}
                  >
                    {c.title}
                  </p>
                  {c.railMetric && (
                    <p
                      className="mt-0.5 font-mono text-[9px] tracking-[0.1em]"
                      style={{ color: healthColor ?? "var(--ink-3)" }}
                    >
                      {c.railMetric}
                    </p>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  {healthColor && (
                    <span
                      aria-hidden
                      className="inline-block h-[6px] w-[6px] rounded-full"
                      style={{ background: healthColor }}
                    />
                  )}
                  <span
                    className="font-mono text-[8px] uppercase tracking-[0.16em]"
                    style={{
                      color:
                        c.status === "live"
                          ? "#d4a157"
                          : c.status === "connecting"
                            ? "var(--ink-2)"
                            : "var(--ink-3)",
                    }}
                  >
                    {c.statusText}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 border-l border-[var(--line)] px-2.5 py-[6px] font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
        + corridors onboarding · pro feeds on request
      </p>
    </section>
  );
}
