"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Bagholder Risk Map · homepage module card (P·08)
   Narrative shock → trapped-cohort positioning → trigger state
   machine. Reads /api/bagholder/triggers via useBagholderBoard; honest
   states (no narratives tracked / feed unreachable) with no modeled
   numbers. Mini risk map (pain × exhaustion) stands in for the full
   workbench's scatter.
──────────────────────────────────────────────────────────────── */
import { BAND_META, BH_ACCENT, ROUTE, useBagholderBoard } from "./bagholder/bagholderData";

export default function BagholderRiskMapFinder({ className = "" }: { className?: string }) {
  const board = useBagholderBoard();
  const active = board.entries.filter((e) => e.trigger.state !== "INVALIDATED" && e.trigger.state !== "EXPIRED" && e.latestSnapshot);

  const stateLine =
    board.status === "loading"
      ? "Connecting"
      : board.status === "error"
        ? "Feed unreachable"
        : active.length === 0
          ? "No narratives tracked"
          : `${active.length} tracked`;

  const liveCount = active.filter((e) => e.trigger.state === "LIVE_TRIGGER").length;

  return (
    <a
      href={ROUTE}
      aria-label="Bagholder Risk Map — narrative shock to trigger state machine, open module"
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
    >
      <div className="relative flex-1 overflow-hidden" style={{ minHeight: 300 }}>
        <div className="pointer-events-none absolute left-5 top-5 z-10 max-w-[56%] md:left-7 md:top-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·08 — <span style={{ color: BH_ACCENT }}>Module</span>
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
            A3RO Intelligence
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            Bagholder Risk Map
          </h3>
          <p className="mt-3 hidden text-[13px] leading-relaxed text-[var(--ink-2)] md:block">
            Narrative shock → trapped-cohort positioning → trigger/invalidator state machine.
          </p>
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            {stateLine}
            {liveCount > 0 && <span style={{ color: BAND_META.live_trigger.color }}> · {liveCount} live</span>}
          </p>
        </div>

        {/* mini risk map — bottom-right */}
        <div className="absolute bottom-5 right-5 md:bottom-7 md:right-7">
          <div className="relative rounded-[3px] border border-[var(--line)] bg-[var(--depth-2)]" style={{ width: 148, height: 148 }}>
            <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="50" x2="50" y1="0" y2="100" stroke="var(--line)" strokeWidth="0.5" />
              <line x1="0" x2="100" y1="50" y2="50" stroke="var(--line)" strokeWidth="0.5" />
              {active.slice(0, 12).map((e) => {
                const snap = e.latestSnapshot!;
                const x = Math.max(4, Math.min(96, snap.layers.positioning.score));
                const y = Math.max(4, Math.min(96, 100 - snap.layers.narrative.score));
                const color = BAND_META[snap.composite.band].color;
                return <circle key={e.trigger.id} cx={x} cy={y} r={3 + (snap.layers.opportunity.score / 100) * 3} fill={color} fillOpacity={0.75} />;
              })}
            </svg>
          </div>
          <p className="mt-2 text-right font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            pain × exhaustion
          </p>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-4 px-5 py-4 hairline-t">
        <h3 className="text-sm font-medium text-[var(--ink)]">
          A3RO Intelligence — Bagholder Risk Map
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Trigger state machine · narrative
        </p>
      </div>
    </a>
  );
}
