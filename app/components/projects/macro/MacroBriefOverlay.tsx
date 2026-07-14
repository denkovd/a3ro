"use client";
/* ────────────────────────────────────────────────────────────────
   P·06 Regime Shift Finder — Macro Brief Overlay (view components).
   Three signal-first elements, no prose blocks:
   · HorizonRibbon   — 0–3M / 3–12M / 12M+ outlook strip
   · CycleGrid       — six macro cycles as tailwind/neutral/headwind tiles
   · AssetStrip      — directional bias tags for Stocks/Bonds/Gold/BTC/Energy
   Reads a derived MacroBrief (see macroBrief.ts). Live-derived tiles
   carry a dot marker; editorial reads carry the brief date instead.
──────────────────────────────────────────────────────────────── */
import { MACRO_AMBER } from "./macroData";
import {
  type MacroBrief,
  type CycleRead,
  scoreLabel,
  scoreColor,
  toneColor,
  biasColor,
  biasLabel,
} from "./macroBrief";

/* ── 1 · horizon ribbon — sits with the CURRENT REGIME block ── */
export function HorizonRibbon({ brief }: { brief: MacroBrief }) {
  return (
    <div className="flex flex-wrap items-stretch gap-1.5" aria-label="Macro outlook by horizon">
      {brief.horizons.map((h) => (
        <div
          key={h.key}
          className="flex items-center gap-2 rounded-[3px] border border-[var(--line)] bg-[var(--depth-2)] px-2.5 py-1.5"
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{h.window}</span>
          <span
            aria-hidden
            className="inline-block h-[5px] w-[5px] rounded-full"
            style={{ background: toneColor(h.tone) }}
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: toneColor(h.tone) }}>
            {h.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── 2 · cycle attribution grid — 3×2 tailwind/headwind tiles ── */
function CycleTile({ c }: { c: CycleRead }) {
  const color = scoreColor(c.score);
  return (
    <div className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-1)] p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{c.label}</span>
        {c.source === "live" && (
          <span
            aria-hidden
            title="Derived from the live feed"
            className="inline-block h-[4px] w-[4px] rounded-full"
            style={{ background: "var(--ink-3)" }}
          />
        )}
      </div>
      <p className="mt-1.5 text-sm font-semibold" style={{ color }}>
        {scoreLabel(c.score)}
      </p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{c.note}</p>
    </div>
  );
}

export function CycleGrid({ brief }: { brief: MacroBrief }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Six macro cycles scored tailwind to headwind">
      {brief.cycleScores.map((c) => (
        <CycleTile key={c.key} c={c} />
      ))}
    </div>
  );
}

/* ── 3 · asset implication strip — narrow directional-bias row ── */
export function AssetStrip({ brief }: { brief: MacroBrief }) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5"
      aria-label="Directional bias by asset"
    >
      {brief.portfolioBias.map((a) => {
        const color = biasColor(a.bias);
        return (
          <div
            key={a.key}
            className="flex flex-col gap-1 rounded-[3px] border border-[var(--line)] bg-[var(--depth-2)] px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{a.label}</span>
              <span
                className="rounded-[2px] px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.15em]"
                style={{ border: `1px solid ${color}`, color }}
              >
                {biasLabel(a.bias)}
              </span>
            </div>
            <span className="font-mono text-[9px] lowercase tracking-[0.05em] text-[var(--ink-2)]">{a.tag}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── combined section: grid + asset strip + risk flags ── */
export default function MacroBriefOverlay({ brief }: { brief: MacroBrief }) {
  return (
    <div className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Macro brief — cycle overlay
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          · live feed &nbsp;|&nbsp; unmarked — brief {brief.asOf}
        </p>
      </div>

      {/* risk flags */}
      {brief.riskFlags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Risk flags">
          {brief.riskFlags.map((f) => (
            <span
              key={f}
              className="rounded-[3px] border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]"
              style={{ borderColor: "var(--line)", color: MACRO_AMBER }}
            >
              ⚑ {f}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5">
        <CycleGrid brief={brief} />
      </div>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
        Asset implications
      </p>
      <div className="mt-2">
        <AssetStrip brief={brief} />
      </div>
    </div>
  );
}
