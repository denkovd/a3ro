"use client";
/* ────────────────────────────────────────────────────────────────
   P·06 — view components for the macro brief.

   · HorizonRibbon    — 0–3M / 3–12M / 12M+ outlook strip (editorial)
   · CycleGrid        — the SIX cycles, now fed by the live snapshot
                        rather than derived in the browser
   · AssetStrip       — directional bias tags (editorial)
   · MacroBriefOverlay— cycles + flags + asset strip

   Live-derived tiles carry a dot; editorial reads carry the brief
   date. That distinction is the whole point of the marker — it must
   never be decorative.
──────────────────────────────────────────────────────────────── */
import { MACRO_AMBER, type LiveCycleRead, type MacroSnapshot } from "./macroData";
import {
  type MacroBrief,
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

/* ── 2 · the six cycles ──
   growth · inflation · policy · corporate profits · liquidity ·
   positioning. Policy and positioning carry sub-reads (real policy
   rate + fiscal impulse; equity + credit realized vol), shown inline
   so a composite tile never hides what produced it. */
function CycleTile({ c }: { c: LiveCycleRead }) {
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

      {c.detail && c.detail.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-[var(--line)] pt-2">
          {c.detail.map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                {d.label}
              </span>
              <span className="shrink-0 font-mono text-[9px] tabular-nums text-[var(--ink-2)]">
                {d.value === null ? "—" : d.value} <span className="text-[var(--ink-3)]">{d.note}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CycleGrid({ cycles }: { cycles: LiveCycleRead[] }) {
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="The six macro cycles scored tailwind to headwind"
    >
      {cycles.map((c) => (
        <CycleTile key={c.key} c={c} />
      ))}
    </div>
  );
}

/* ── 3 · asset implication strip ── */
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

/* ── combined section ── */
export default function MacroBriefOverlay({
  brief,
  snap,
}: {
  brief: MacroBrief;
  snap: MacroSnapshot;
}) {
  return (
    <div className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          The six cycles — is this regime sustainable?
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          · live feed &nbsp;|&nbsp; unmarked — brief {brief.asOf}
        </p>
      </div>

      {snap.cyclesHeadline && (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">{snap.cyclesHeadline}</p>
      )}

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
        {snap.cycles.length > 0 ? (
          <CycleGrid cycles={snap.cycles} />
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            Cycles pending — awaiting first run of the updated macro cycle
          </p>
        )}
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
