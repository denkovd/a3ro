"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Regime Finder · homepage module card (P·04)
   A live intelligence surface: ranked regime shifts across a
   30-asset macro watchlist, scored by the Money Line engine
   (Donchian 20 close-flip) on daily × weekly closes. The card
   leads with what just turned — newly bullish alignments — and
   opens the full ranked table at /Projects/Regime-Finder.
   All data arrives as one RegimeSnapshot through the data layer
   (regime/regimeData.ts); when the scan hasn't run yet the card
   says so instead of inventing numbers (truth-pass rule).
──────────────────────────────────────────────────────────────── */
import { motion, useReducedMotion } from "framer-motion";
import {
  useRegimeSnapshot,
  formatDate,
  formatDaysSince,
  formatPct,
  verdictDistribution,
  REGIME_ACCENT,
  MUTED_AMBER,
  MUTED_PINK,
  ROUTE,
  type RegimeRow,
} from "./regime/regimeData";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 62%, #0d1512 0%, var(--depth-1) 55%, #070808 100%)";

/* Decorative Money Line motif — a bearish step ceiling flipping to a
   bullish step floor. Hardcoded (deterministic, SSR-safe), aria-hidden:
   module grammar texture, not data. */
const BEAR_STEPS = "M0,34 H16 V44 H30 V53 H44 V60 H55";
const BULL_STEPS = "M55,74 H66 V60 H76 V48 H88 V38 H100";

/** Card hero rows: newly bullish first; falls back to the top-ranked
 *  established bulls when nothing fresh flipped this window. */
function highlights(rows: RegimeRow[], max = 4): { rows: RegimeRow[]; fresh: boolean } {
  const fresh = rows.filter((r) => r.newlyBullish).slice(0, max);
  if (fresh.length > 0) return { rows: fresh, fresh: true };
  return { rows: rows.filter((r) => r.verdict === "BULLISH").slice(0, max), fresh: false };
}

export default function RegimeFinder({ className = "" }: { className?: string }) {
  const snap = useRegimeSnapshot();
  const reduced = useReducedMotion();

  const live = snap.status === "live";
  const hero = highlights(snap.rows);
  const dist = verdictDistribution(snap.rows);
  const newlyCount = snap.rows.filter((r) => r.newlyBullish).length;

  const monitorText =
    snap.status === "live"
      ? "Monitor · daily scan"
      : snap.status === "pending"
        ? "Monitor · awaiting first scan"
        : snap.status === "error"
          ? "Monitor · feed unreachable"
          : "Monitor · connecting";

  return (
    <a
      href={ROUTE}
      aria-label="Regime Finder — cross-asset regime shifts, open module"
      className={`group/rf relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
    >
      {/* stage */}
      <div className="relative flex-1 overflow-hidden">
        <div aria-hidden className="absolute inset-0" style={{ background: ATMOSPHERE }} />
        {/* time ticks — module grammar */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0px, transparent 47px, var(--line) 48px)",
          }}
        />

        {/* Money Line motif — bear ceiling flips to bull floor */}
        <div aria-hidden className="absolute inset-x-12 bottom-12 top-[56%]">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path
              d={BEAR_STEPS}
              fill="none"
              stroke={MUTED_PINK}
              strokeOpacity="0.45"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={BULL_STEPS}
              fill="none"
              stroke={REGIME_ACCENT}
              strokeOpacity="0.55"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="55"
              x2="100"
              y1="38"
              y2="38"
              stroke={REGIME_ACCENT}
              strokeOpacity="0.16"
              strokeWidth="1"
              strokeDasharray="0.8 1.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* terminal marker — stays round while the svg stretches */}
          <span
            className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: "100%",
              top: "38%",
              background: REGIME_ACCENT,
              boxShadow: `0 0 12px ${REGIME_ACCENT}55`,
            }}
          />
        </div>

        {/* ghost numeral */}
        <span className="pointer-events-none absolute bottom-3 left-4 select-none font-mono text-[clamp(4rem,10vw,8rem)] font-medium leading-none text-[var(--depth-3)]">
          04
        </span>

        {/* corner registration marks */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/rf:border-[#5fc9a4] group-hover/rf:opacity-100"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30"
        />

        {/* identity + highlights — left */}
        <div className="pointer-events-none absolute left-5 top-5 max-w-[58%] md:left-7 md:top-7 md:max-w-[48%]">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·04 — <span style={{ color: REGIME_ACCENT }}>Module</span>
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
            A3RO Intelligence
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            Regime Finder
          </h3>
          <p className="mt-3 hidden text-[13px] leading-relaxed text-[var(--ink-2)] md:block">
            Cross-asset regime shifts — trend flips confirmed on daily and
            weekly closes, ranked by recency.
          </p>

          {/* hero list: what just turned */}
          <div className="mt-5 md:mt-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              {live
                ? hero.fresh
                  ? "Newly bullish"
                  : "No fresh flips — established regimes"
                : snap.status === "pending"
                  ? "Scan pending"
                  : snap.status === "error"
                    ? "Feed unreachable"
                    : "Connecting"}
            </p>

            {live ? (
              <ul className="mt-3 flex flex-col gap-[9px] md:gap-2.5">
                {hero.rows.map((r) => (
                  <li key={r.symbol} className="flex items-baseline gap-3">
                    <span
                      aria-hidden
                      className="h-[5px] w-[5px] shrink-0 self-center rounded-full"
                      style={{
                        background: r.newlyBullish ? REGIME_ACCENT : "var(--ink-3)",
                        boxShadow: r.newlyBullish ? `0 0 8px ${REGIME_ACCENT}66` : "none",
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
                      {r.displayName}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                      {formatDaysSince(r.daysSinceAligned)}
                    </span>
                    <span
                      className="shrink-0 font-mono text-[10px] tabular-nums"
                      style={{ color: REGIME_ACCENT }}
                    >
                      {formatPct(r.strength)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 max-w-[240px] font-mono text-[9px] uppercase leading-relaxed tracking-[0.15em] text-[var(--ink-3)]">
                {snap.status === "pending"
                  ? "First pass runs 06:00 UTC — states appear after the daily scan."
                  : snap.status === "error"
                    ? "Regime feed did not respond — retry on reload."
                    : "Requesting latest scan…"}
              </p>
            )}
          </div>
        </div>

        {/* scan readout — right */}
        <div className="pointer-events-none absolute right-5 top-5 flex flex-col items-end text-right md:right-7 md:top-7">
          <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            {!reduced ? (
              <motion.span
                aria-hidden
                className="inline-block h-[5px] w-[5px] rounded-full"
                style={{ background: REGIME_ACCENT }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <span
                aria-hidden
                className="inline-block h-[5px] w-[5px] rounded-full"
                style={{ background: REGIME_ACCENT }}
              />
            )}
            {monitorText}
          </p>

          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            New bull regimes
          </p>
          <p className="mt-1 font-mono text-3xl font-medium tabular-nums tracking-tight text-[var(--ink)] md:text-5xl">
            {live ? String(newlyCount).padStart(2, "0") : "——"}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            {live ? `Scan ${formatDate(snap.runDate)} · ${snap.count} assets` : "No scan on record"}
          </p>

          {live && (
            <div className="mt-4 w-36 md:mt-5 md:w-44">
              {[
                { label: "Bullish", value: dist.bullish, color: REGIME_ACCENT },
                { label: "Conflicted", value: dist.conflicted, color: MUTED_AMBER },
                { label: "Bearish", value: dist.bearish, color: MUTED_PINK },
              ].map(({ label, value, color }, i) => (
                <div
                  key={label}
                  className={`flex items-baseline justify-between py-[5px] ${i > 0 ? "hairline-t" : ""}`}
                >
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                    {label}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color }}>
                    {String(value).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* the one affordance */}
        <p className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-base)] group-hover/rf:text-[var(--ink)] md:bottom-6 md:right-7">
          Open module
          <span
            aria-hidden
            className="inline-block transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/rf:translate-x-1"
            style={{ color: REGIME_ACCENT }}
          >
            →
          </span>
        </p>
      </div>

      {/* card footer — directory grammar */}
      <div className="flex items-baseline justify-between gap-4 px-5 py-4 hairline-t">
        <h3 className="text-sm font-medium text-[var(--ink)]">
          A3RO Intelligence — Regime Finder
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Cross-asset regime shifts — daily × weekly confirm
        </p>
      </div>
    </a>
  );
}
