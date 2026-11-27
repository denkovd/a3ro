"use client";
/* ────────────────────────────────────────────────────────────────
   BTC Tracker — price chart, top-left, expandable.

   The price is a TradingView widget (BITSTAMP:BTCUSD), which updates
   through the day (#123; the page is public, so the widget terms in
   #37 are met). The overlay is the macro cycle's VAMS regime-affinity
   read for BTC-USD (backend/src/macro/vams.ts, via /api/macro/latest
   → vamsReads), the same signal and palette as RiskMatrixPanel.
──────────────────────────────────────────────────────────────── */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TradingViewWidget from "../../TradingViewWidget";
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

const COLLAPSED_W = 220;
const EXPANDED_W = 300;

export default function BtcPriceChart() {
  const [expanded, setExpanded] = useState(false);
  const macro = useMacroSnapshot();

  const affinity = macro.vamsReads.find((r) => r.symbol === "BTC-USD") ?? null;
  const color = affinity ? STATE_COLOR[affinity.state] : "var(--ink-3)";
  const glyph = affinity ? STATE_GLYPH[affinity.state] : "—";

  const containerW = expanded ? EXPANDED_W : COLLAPSED_W;

  return (
    <div>
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
            BTC · Price
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px]" style={{ color }}>
            {glyph}
            <span className="text-[var(--ink-3)]">{expanded ? "▾" : "▸"}</span>
          </span>
        </button>

        <div className="px-1 pb-1">
          <TradingViewWidget key={expanded ? "wide" : "narrow"} widget="mini-symbol-overview" height={expanded ? 200 : 130} label="Bitcoin (BITSTAMP:BTCUSD)"
            config={{ symbol: "BITSTAMP:BTCUSD", dateRange: expanded ? "12M" : "1M", trendLineColor: "#e0873a", underLineColor: "rgba(224,135,58,0.12)", underLineBottomColor: "rgba(224,135,58,0)" }} />
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
