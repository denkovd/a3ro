"use client";
/* ────────────────────────────────────────────────────────────────
   P·06 — Global Macro Risk Matrix (Dale's top-down layer).

   What regime is the MARKET pricing, as against what regime the
   economy is in. Two elements:
   · confirmation shares per regime, with the modal regime called out
   · the per-market VAMS grid behind those shares

   The economy/market split is rendered explicitly rather than
   reconciled. When the GRID says Reflation and the matrix says
   Deflation, the page should show a disagreement, because that is
   what Dale's framework treats as the actionable signal.
──────────────────────────────────────────────────────────────── */
import { useState } from "react";
import {
  MACRO_AMBER,
  MACRO_PINK,
  QUADRANT_META,
  type MacroQuadrant,
  type MacroSnapshot,
  type VamsState,
} from "./macroData";

const ORDER: Exclude<MacroQuadrant, "PENDING">[] = [
  "GOLDILOCKS",
  "REFLATION",
  "INFLATION",
  "DEFLATION",
];

const stateColor = (s: VamsState): string =>
  s === "BULLISH" ? "#5fc9a4" : s === "BEARISH" ? MACRO_PINK : s === "NEUTRAL" ? MACRO_AMBER : "var(--ink-3)";

const stateGlyph = (s: VamsState): string =>
  s === "BULLISH" ? "▲" : s === "BEARISH" ? "▼" : s === "NEUTRAL" ? "·" : "—";

export default function RiskMatrixPanel({ snap }: { snap: MacroSnapshot }) {
  const [open, setOpen] = useState(false);
  const live = snap.marketRegime !== "PENDING";
  const disagrees = live && snap.quadrant !== "PENDING" && snap.marketRegime !== snap.quadrant;

  return (
    <div className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Global Macro Risk Matrix — what the market is pricing
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          VAMS · {snap.marketScored}/{snap.marketUniverse} markets scored
        </p>
      </div>

      {!live && (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Matrix pending — awaiting a scan with sufficient bar history
        </p>
      )}

      {live && (
        <>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              Market regime
            </span>
            <span
              className="text-xl font-semibold"
              style={{ color: QUADRANT_META[snap.marketRegime as Exclude<MacroQuadrant, "PENDING">].color }}
            >
              {QUADRANT_META[snap.marketRegime as Exclude<MacroQuadrant, "PENDING">].label}
            </span>
            {snap.marketRiskOn !== null && (
              <span className="font-mono text-[11px] text-[var(--ink-2)]">
                {Math.round(snap.marketRiskOn * 100)}% risk-on
              </span>
            )}
            {disagrees && (
              <span
                className="rounded-[3px] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]"
                style={{ background: MACRO_AMBER, color: "var(--depth-0)" }}
              >
                Split vs economy
              </span>
            )}
          </div>

          {disagrees && (
            <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[var(--ink-3)]">
              The economy reads{" "}
              {QUADRANT_META[snap.quadrant as Exclude<MacroQuadrant, "PENDING">].label} while markets are
              confirming {QUADRANT_META[snap.marketRegime as Exclude<MacroQuadrant, "PENDING">].label}. Markets
              typically price a regime one to three months ahead of the data, so a split is a lead, not an error.
            </p>
          )}

          {/* confirmation shares */}
          <div className="mt-5 space-y-2">
            {ORDER.map((q) => {
              const share = snap.marketShares[q] ?? 0;
              const meta = QUADRANT_META[q];
              const on = q === snap.marketRegime;
              return (
                <div key={q} className="flex items-center gap-3">
                  <span
                    className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.15em]"
                    style={{ color: on ? meta.color : "var(--ink-3)" }}
                  >
                    {meta.label}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--depth-2)]">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{ width: `${Math.round(share * 100)}%`, background: meta.color, opacity: on ? 1 : 0.45 }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-2)]">
                    {Math.round(share * 100)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* per-market VAMS detail */}
          {snap.vamsReads.length > 0 && (
            <>
              <button
                onClick={() => setOpen((v) => !v)}
                className="mt-5 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
                aria-expanded={open}
              >
                {open ? "− Hide" : "+ Show"} per-market signal ({snap.vamsReads.length})
              </button>

              {open && (
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {snap.vamsReads.map((r) => (
                    <div key={r.symbol} className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-[10px] text-[var(--ink-2)]">{r.displayName}</span>
                      <span className="flex shrink-0 items-baseline gap-1.5">
                        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                          {r.z === null ? "—" : r.z.toFixed(2)}
                        </span>
                        <span className="font-mono text-[11px]" style={{ color: stateColor(r.state) }}>
                          {stateGlyph(r.state)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <p className="mt-5 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
            Each market is scored by a volatility-adjusted momentum signal — the 63-session return divided by what
            that market&apos;s own daily noise would produce over 63 sessions, so the number is a trend strength
            already net of volatility. Bullish above +0.5, bearish below −0.5, neutral between. Each scored market
            carries one point split across the regimes its state confirms; neutral markets and markets with no clean
            regime read contribute nothing.
          </p>
        </>
      )}
    </div>
  );
}
