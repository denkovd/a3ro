"use client";
/* ────────────────────────────────────────────────────────────────
   P·06 — liquidity stress + cost of capital.

   The 24 Jul 2026 read's home: "is the global cost of capital too
   low?" Two blocks:
   · LiquidityPanel      — the 0..100 composite and its eight legs,
                           asset-neutral (this REPLACED "macro pressure
                           on oil" as the page's headline number)
   · CostOfCapitalPanel  — Dale's per-market table, editorial and
                           dated, shown against the live nominal-growth
                           read that motivates it

   Every leg shows its own scale, so the composite never has to be
   taken on trust.
──────────────────────────────────────────────────────────────── */
import {
  MACRO_ACCENT,
  MACRO_AMBER,
  MACRO_PINK,
  formatPct,
  type MacroSnapshot,
} from "./macroData";
import { BRIEF_GREEN } from "./macroBrief";

const statusColor = (s: string): string =>
  s === "elevated" ? MACRO_PINK : s === "muted" ? BRIEF_GREEN : MACRO_AMBER;

const sourceLabel = (s: "fred" | "yahoo" | "derived"): string =>
  s === "fred" ? "FRED" : s === "yahoo" ? "market" : "derived";

export function LiquidityPanel({ snap }: { snap: MacroSnapshot }) {
  const pending = snap.liquidityScore === null;

  return (
    <div className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Liquidity stress — the price of capital
        </p>
        {snap.riskPremiumAlert && (
          <span
            className="rounded-[3px] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]"
            style={{ background: MACRO_PINK, color: "var(--ink)" }}
          >
            Risk-premium repricing
          </span>
        )}
      </div>

      {snap.liquidityHeadline && (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">{snap.liquidityHeadline}</p>
      )}

      <div className="mt-5 flex items-baseline gap-3">
        <span
          className="text-3xl font-semibold"
          style={{ color: pending ? "var(--ink-3)" : statusColor(snap.liquidityStatus) }}
        >
          {snap.liquidityScore ?? "—"}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          / 100 · {snap.liquidityStatus}
        </span>
      </div>

      {snap.liquidityLegs.length > 0 ? (
        <div className="mt-5 space-y-2">
          {snap.liquidityLegs.map((l) => (
            <div key={l.key} className="flex items-center gap-3">
              <span className="w-44 shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                {l.label}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--depth-2)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((l.normalized ?? 0) * 100)}%`,
                    background: l.normalized === null ? "var(--line)" : MACRO_ACCENT,
                  }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-2)]">
                {l.value === null ? "pending" : l.value}
              </span>
              <span className="hidden w-16 shrink-0 text-right font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-3)] sm:block">
                {sourceLabel(l.source)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Legs pending — awaiting first run of the updated macro cycle
        </p>
      )}

      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
        Higher = tighter liquidity and a faster repricing of capital. Level legs use fixed documented scales; the
        volatility legs are percentiled against their own trailing year, because a given basis-point move in rate
        volatility means something different at 1% yields than at 5%. Bond volatility is a realized-vol proxy for
        the MOVE index, computed from daily 10-year yield changes. The repricing flag needs both an elevated
        composite and a bond-vol breakout — either alone is a level, not a repricing.
      </p>
    </div>
  );
}

export { CostOfCapitalPanel } from "./CostOfCapitalPanel";
