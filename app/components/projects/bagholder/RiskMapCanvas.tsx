"use client";
/* ────────────────────────────────────────────────────────────────
   P·08 — the Risk Map itself: one SVG scatter plotting every open
   trigger by the two layers that decide whether a cohort is actually
   trapped — positioning/pain (x) vs narrative exhaustion (y) — with
   bubble size for opportunity and color for trigger state. This is
   the "map" the module is named for: a spatial read of where trapped
   cohorts currently sit, not just a sorted list.
──────────────────────────────────────────────────────────────── */
import { BAND_META, BoardEntry } from "./bagholderData";

export default function RiskMapCanvas({
  entries,
  selectedId,
  onSelect,
}: {
  entries: BoardEntry[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const plottable = entries.filter((e) => e.latestSnapshot && e.trigger.state !== "EXPIRED");

  return (
    <div className="relative w-full" style={{ aspectRatio: "16 / 10" }}>
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* quadrant gridlines */}
        <line x1="50" x2="50" y1="0" y2="100" stroke="var(--line)" strokeWidth="0.3" />
        <line x1="0" x2="100" y1="50" y2="50" stroke="var(--line)" strokeWidth="0.3" />
        {[25, 75].map((p) => (
          <g key={p}>
            <line x1={p} x2={p} y1="0" y2="100" stroke="var(--line)" strokeOpacity="0.4" strokeWidth="0.2" strokeDasharray="0.8 1.2" />
            <line x1="0" x2="100" y1={p} y2={p} stroke="var(--line)" strokeOpacity="0.4" strokeWidth="0.2" strokeDasharray="0.8 1.2" />
          </g>
        ))}

        {plottable.map((e) => {
          const snap = e.latestSnapshot!;
          const x = Math.max(3, Math.min(97, snap.layers.positioning.score));
          const y = Math.max(3, Math.min(97, 100 - snap.layers.narrative.score));
          const r = 2.2 + (snap.layers.opportunity.score / 100) * 4.5;
          const color = BAND_META[snap.composite.band].color;
          const selected = selectedId === e.trigger.id;
          return (
            <g key={e.trigger.id} onClick={() => onSelect(e.trigger.id)} className="cursor-pointer">
              {selected && (
                <circle cx={x} cy={y} r={r + 2.2} fill="none" stroke={color} strokeWidth="0.6" strokeOpacity="0.7" />
              )}
              <circle cx={x} cy={y} r={r} fill={color} fillOpacity={selected ? 0.95 : 0.65} stroke={color} strokeWidth="0.3" />
            </g>
          );
        })}
      </svg>

      {/* axis captions */}
      <p className="pointer-events-none absolute bottom-1 right-2 font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
        positioning / pain →
      </p>
      <p className="pointer-events-none absolute left-2 top-1 font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-3)]" style={{ writingMode: "vertical-rl" }}>
        ↑ narrative exhaustion
      </p>

      {plottable.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          No open triggers to map yet
        </p>
      )}
    </div>
  );
}
