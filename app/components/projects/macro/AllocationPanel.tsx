"use client";
/* ────────────────────────────────────────────────────────────────
   P·06 — the KISS allocation target.

   The page's conclusion: given the regime the market is pricing, how
   sustainable the six cycles say it is, and whether each sleeve is
   actually trending, what does the rule target today?

       weight = cap × regimeScore × vamsMultiplier × cycleDrag

   Every sleeve shows all four factors, because a number this close to
   a real decision has to be traceable to its inputs rather than
   arriving as an oracle. Weights are computed server-side in the macro
   cycle and persisted, so what renders here is exactly what the cycle
   derived — the UI does no allocation maths of its own.

   This is a RULE OUTPUT on a page that says not investment advice, and
   the copy says so. The backtest (npm run backtest:allocation) is the
   thing that says whether the rule is any good; until it has been run
   against real prices the panel says that too.
──────────────────────────────────────────────────────────────── */
import {
  MACRO_ACCENT,
  MACRO_AMBER,
  MACRO_PINK,
  QUADRANT_META,
  type MacroQuadrant,
  type MacroSnapshot,
  type SleeveKey,
  type VamsState,
} from "./macroData";
import { BRIEF_GREEN } from "./macroBrief";

const SLEEVE_LABEL: Record<SleeveKey, string> = {
  stocks: "S&P 500",
  gold: "Gold",
  bitcoin: "Bitcoin",
};

const SLEEVE_COLOR: Record<SleeveKey, string> = {
  stocks: MACRO_ACCENT,
  gold: MACRO_AMBER,
  bitcoin: BRIEF_GREEN,
};

const stateLabel = (s: VamsState): string =>
  s === "BULLISH" ? "bullish" : s === "BEARISH" ? "bearish" : s === "NEUTRAL" ? "neutral" : "no signal";

const stateColor = (s: VamsState): string =>
  s === "BULLISH" ? BRIEF_GREEN : s === "BEARISH" ? MACRO_PINK : "var(--ink-3)";

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function AllocationPanel({ snap }: { snap: MacroSnapshot }) {
  const pending = snap.allocationInvested === null || snap.allocationWeights.length === 0;
  const invested = snap.allocationInvested ?? 0;
  const cash = snap.allocationCash ?? 1;

  return (
    <div className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Allocation target — the rule&apos;s expression
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          {snap.allocationRegimeSource === "market"
            ? "vs market regime"
            : snap.allocationRegimeSource === "economic"
              ? "vs economic regime · matrix pending"
              : "no regime"}
        </p>
      </div>

      {pending && (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Allocation pending — awaiting a macro cycle run with the allocation layer
        </p>
      )}

      {!pending && (
        <>
          {/* headline: invested vs cash */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <span className="text-3xl font-semibold text-[var(--ink)]">{pct1(invested)}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              invested · {pct1(cash)} cash
            </span>
            {snap.allocationRegime !== "PENDING" && (
              <span
                className="font-mono text-[11px] uppercase tracking-[0.15em]"
                style={{ color: QUADRANT_META[snap.allocationRegime as Exclude<MacroQuadrant, "PENDING">].color }}
              >
                {QUADRANT_META[snap.allocationRegime as Exclude<MacroQuadrant, "PENDING">].label}
              </span>
            )}
          </div>

          {/* stacked bar — sleeves + cash, to scale */}
          <div
            className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-[var(--depth-2)]"
            aria-label="Target allocation by sleeve"
          >
            {snap.allocationWeights.map((w) => (
              <div
                key={w.key}
                style={{ width: `${w.weight * 100}%`, background: SLEEVE_COLOR[w.key] }}
                title={`${SLEEVE_LABEL[w.key]} ${pct1(w.weight)}`}
              />
            ))}
          </div>

          {/* per-sleeve breakdown, with every factor shown */}
          <div className="mt-6 space-y-3">
            {snap.allocationWeights.map((w) => {
              const ofCap = w.cap > 0 ? w.weight / w.cap : 0;
              return (
                <div key={w.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        aria-hidden
                        className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: SLEEVE_COLOR[w.key] }}
                      />
                      <span className="text-sm text-[var(--ink)]">{SLEEVE_LABEL[w.key]}</span>
                      <span
                        className="font-mono text-[9px] uppercase tracking-[0.15em]"
                        style={{ color: stateColor(w.state) }}
                      >
                        {w.available ? stateLabel(w.state) : "no history"}
                      </span>
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-[var(--ink)]">
                      {pct1(w.weight)}
                      <span className="ml-1.5 text-[10px] text-[var(--ink-3)]">
                        of {pct1(w.cap)} cap · {Math.round(ofCap * 100)}% used
                      </span>
                    </span>
                  </div>

                  {/* the four factors behind the weight */}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-[15px] font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    <span>regime ×{w.regimeScore.toFixed(2)}</span>
                    <span>trend ×{w.vamsMultiplier.toFixed(2)}</span>
                    <span>
                      cycles ×{w.cycleDrag.toFixed(2)}
                      {w.cycleDrag === 1 && w.key === "gold" && (
                        <span className="ml-1 normal-case tracking-normal text-[var(--ink-3)]">
                          (hedge — exempt)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* cash as its own row, so it reads as a position not a gap */}
            <div className="flex items-baseline justify-between border-t border-[var(--line)] pt-3">
              <span className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--depth-3)]"
                />
                <span className="text-sm text-[var(--ink-2)]">Cash</span>
              </span>
              <span className="font-mono text-[12px] tabular-nums text-[var(--ink-2)]">{pct1(cash)}</span>
            </div>
          </div>
        </>
      )}

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
        Caps are stocks 60% / gold 30% / Bitcoin 10%; cash is the remainder, so the book is never
        leveraged. Each weight is its cap scaled by how much the current regime favours that sleeve,
        whether the sleeve is actually trending (VAMS), and how many of the six cycles are working
        against risk assets — gold is exempt from that last one, since cutting a hedge when the cycles
        turn hostile defeats the point of holding it. No regime read at all means 100% cash rather
        than a default position.
      </p>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
        This is the output of a mechanical rule, not a recommendation, and the rule has not yet been
        validated against real price history — run <span className="font-mono">backtest:allocation</span>{" "}
        to judge it. The regime scores behind it are reasoned rather than backtested.
      </p>
    </div>
  );
}
