"use client";
/* ────────────────────────────────────────────────────────────────
   BTC Tracker — weekly price chart, top-left, expandable.

   The overlay is the macro cycle's existing VAMS regime-affinity read
   for BTC-USD (backend/src/macro/vams.ts, exposed via
   /api/macro/latest → vamsReads) — the same volatility-adjusted
   momentum signal and BULLISH/BEARISH/NEUTRAL palette used by
   RiskMatrixPanel, not a new indicator invented for this chart. That
   VAMS read is computed off daily market_bars sessions (63-session
   window); the price series charted here is the tracker's own daily
   Coinbase closes (btc_prices), bucketed into ISO weeks client-side
   since neither store keeps a weekly aggregate.
──────────────────────────────────────────────────────────────── */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useBtcWeeklyHistory, type WeeklyBar } from "./btcHistory";
import { useMacroSnapshot, MACRO_AMBER, MACRO_PINK, type VamsState } from "../macro/macroData";

const STATE_COLOR: Record<VamsState, string> = {
  BULLISH: "#5fc9a4",
  BEARISH: MACRO_PINK,
  NEUTRAL: MACRO_AMBER,
  PENDING: "var(--ink-3)",
};
const STATE_GLYPH: Record<VamsState, string> = {
  BULLISH: "▲",
  BEARISH: "▼",
  NEUTRAL: "·",
  PENDING: "—",
};
const REGIME_LABEL: Record<string, string> = {
  GOLDILOCKS: "Goldilocks",
  REFLATION: "Reflation",
  INFLATION: "Inflation",
  DEFLATION: "Deflation",
};

function buildPath(bars: WeeklyBar[], w: number, h: number, pad = 4) {
  const closes = bars.map((b) => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = innerW / (bars.length - 1);
  const pts = bars.map((b, i) => {
    const x = pad + i * step;
    const y = pad + innerH - ((b.close - min) / span) * innerH;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const floor = (h - pad).toFixed(1);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${floor} L${pts[0][0].toFixed(1)},${floor} Z`;
  return { line, area };
}

const COLLAPSED_W = 220;
const EXPANDED_W = 300;
const PAD_X = 24; // px-3 both sides

export default function BtcPriceChart() {
  const [expanded, setExpanded] = useState(false);
  const { status, bars } = useBtcWeeklyHistory();
  const macro = useMacroSnapshot();

  const affinity = macro.vamsReads.find((r) => r.symbol === "BTC-USD") ?? null;
  const color = affinity ? STATE_COLOR[affinity.state] : "var(--ink-3)";
  const glyph = affinity ? STATE_GLYPH[affinity.state] : "—";

  const view = useMemo(() => bars.slice(expanded ? -104 : -26), [bars, expanded]);
  const containerW = expanded ? EXPANDED_W : COLLAPSED_W;
  const svgW = containerW - PAD_X;
  const svgH = expanded ? 150 : 56;
  const path = useMemo(
    () => (view.length >= 2 ? buildPath(view, svgW, svgH) : null),
    [view, svgW, svgH],
  );

  const latest = bars[bars.length - 1] ?? null;
  const first = view[0] ?? null;
  const periodChangePct =
    latest && first && first.close !== 0
      ? ((latest.close - first.close) / Math.abs(first.close)) * 100
      : null;

  return (
    <div className="absolute left-4 top-4 z-20 md:left-6 md:top-6">
      <div
        className="rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.85)] backdrop-blur-md transition-[width] duration-200"
        style={{ width: containerW }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-2 px-3 py-2"
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-2)]">
            BTC · Weekly
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px]" style={{ color }}>
            {glyph}
            <span className="text-[var(--ink-3)]">{expanded ? "▾" : "▸"}</span>
          </span>
        </button>

        <div className="px-3 pb-2.5">
          {status === "loading" && (
            <p className="py-3 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              Loading…
            </p>
          )}
          {status === "error" && (
            <p className="py-3 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              History unavailable
            </p>
          )}
          {status === "live" && !path && (
            <p className="py-3 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              Awaiting enough weekly closes
            </p>
          )}
          {status === "live" && path && (
            <>
              <svg width={svgW} height={svgH} className="block">
                <path d={path.area} fill={color} opacity={0.14} />
                <path d={path.line} fill="none" stroke={color} strokeWidth={1.4} />
              </svg>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">
                  ${Math.round(latest?.close ?? 0).toLocaleString("en-US")}
                </span>
                {periodChangePct !== null && (
                  <span className="font-mono text-[9px] tabular-nums" style={{ color }}>
                    {periodChangePct > 0 ? "+" : periodChangePct < 0 ? "−" : ""}
                    {Math.abs(periodChangePct).toFixed(1)}%
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-[var(--line)] px-3 py-2.5"
            >
              <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
                Macro regime affinity
              </p>
              {affinity ? (
                <>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span
                      className="font-mono text-[11px] uppercase tracking-[0.16em]"
                      style={{ color }}
                    >
                      {affinity.state}
                    </span>
                    {affinity.z !== null && (
                      <span className="font-mono text-[9px] tabular-nums text-[var(--ink-3)]">
                        z {affinity.z.toFixed(2)}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-3)]">
                    {affinity.confirms.length > 0
                      ? `Confirms ${affinity.confirms.map((q) => REGIME_LABEL[q] ?? q).join(", ")}`
                      : "No clean regime read in this state"}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[10px] text-[var(--ink-3)]">
                  Awaiting the macro cycle&apos;s first VAMS read for BTC-USD
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
