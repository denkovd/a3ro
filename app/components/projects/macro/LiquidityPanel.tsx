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
import { BRIEF_GREEN, type MacroBrief } from "./macroBrief";

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

export function CostOfCapitalPanel({
  brief,
  snap,
}: {
  brief: MacroBrief;
  snap: MacroSnapshot;
}) {
  const max = Math.max(...brief.costOfCapital.map((c) => Math.max(c.current, c.longRunMean)), 1);

  return (
    <div className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Cost of capital vs long-run mean
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          brief {brief.asOf} — no free feed
        </p>
      </div>

      {/* live nominal-growth read — the reason the table matters */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          US nominal GDP
          <span
            aria-hidden
            title="Derived from the live feed"
            className="ml-1.5 inline-block h-[4px] w-[4px] rounded-full align-middle"
            style={{ background: "var(--ink-3)" }}
          />
        </span>
        <span className="text-lg font-semibold text-[var(--ink)]">{formatPct(snap.nominalGdpYoy)}</span>
        <span className="font-mono text-[11px] text-[var(--ink-3)]">
          2015–19 trend {formatPct(snap.nominalTrend1519)} · 2003–07 {formatPct(snap.nominalTrend0307)}
        </span>
        {snap.nominalGap !== null && (
          <span
            className="font-mono text-[11px]"
            style={{ color: snap.nominalGap > 0 ? MACRO_AMBER : "var(--ink-3)" }}
          >
            {snap.nominalGap > 0 ? "+" : ""}
            {snap.nominalGap.toFixed(1)}pp vs recent trend
          </span>
        )}
      </div>

      <div className="mt-5 space-y-2.5">
        {brief.costOfCapital.map((c) => {
          const below = c.gap < 0;
          return (
            <div key={c.market} className="flex items-center gap-3">
              <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                {c.market}
              </span>
              <div className="relative h-3 flex-1">
                {/* long-run mean marker */}
                <div
                  aria-hidden
                  className="absolute top-0 h-3 w-px"
                  style={{ left: `${(c.longRunMean / max) * 100}%`, background: "var(--ink-3)" }}
                />
                {/* current bar */}
                <div
                  className="absolute top-[5px] h-1 rounded-full"
                  style={{
                    width: `${(c.current / max) * 100}%`,
                    background: below ? MACRO_PINK : BRIEF_GREEN,
                  }}
                />
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-2)]">
                {c.current.toFixed(2)}%
              </span>
              <span
                className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums"
                style={{ color: below ? MACRO_PINK : BRIEF_GREEN }}
              >
                {c.gap > 0 ? "+" : ""}
                {c.gap.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
        {brief.costOfCapitalNote} Bar = current, tick = long-run mean. This table has no free feed — the equity
        earnings-yield half is not available keylessly — so it is a dated editorial read, unlike the nominal GDP
        figure above it, which is live.
      </p>
    </div>
  );
}
